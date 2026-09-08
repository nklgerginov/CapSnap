"""Generate deterministic ASS subtitles and FFmpeg commands for NovaCap captions."""

from __future__ import annotations

import argparse
import json
import shlex
from pathlib import Path
from typing import Any


def validate_subtitle_data(subtitle_data: dict[str, Any]) -> None:
    """Reject malformed timing before it reaches ASS or FFmpeg."""
    if not isinstance(subtitle_data, dict):
        raise ValueError("subtitle data must be an object")
    for block in subtitle_data.get("blocks", []):
        words = block.get("words", [])
        previous_end = 0.0
        for word in words:
            start = float(word["start"])
            end = float(word["end"])
            if start < 0 or end <= start:
                raise ValueError("word timings must be positive and increasing")
            if words and start < previous_end:
                raise ValueError("word timings must not overlap")
            previous_end = end


def _ass_time(seconds: float) -> str:
    seconds = max(0.0, float(seconds))
    centiseconds = round(seconds * 100)
    hours, remainder = divmod(centiseconds, 360000)
    minutes, remainder = divmod(remainder, 6000)
    whole_seconds, centis = divmod(remainder, 100)
    return f"{hours}:{minutes:02d}:{whole_seconds:02d}.{centis:02d}"


def _ass_color(value: str, fallback: str = "&H00FFFFFF") -> str:
    value = value.strip().lstrip("#")
    if len(value) == 3:
        value = "".join(char * 2 for char in value)
    if len(value) == 8:
        red, green, blue, alpha = value[0:2], value[2:4], value[4:6], value[6:8]
        return f"&H{alpha}{blue}{green}{red}".upper()
    if len(value) != 6:
        return fallback
    red, green, blue = value[0:2], value[2:4], value[4:6]
    return f"&H00{blue}{green}{red}".upper()


def _ass_escape(text: str) -> str:
    return str(text).replace("\\", "\\\\").replace("{", r"\{").replace("}", r"\}")


def _word_tag(word: dict[str, Any], style: dict[str, Any]) -> str:
    animation = style.get("animation_type", "pop")
    highlight = _ass_color(style.get("highlight_color", "#FFE600"))
    primary = _ass_color(style.get("primary_color", "#FFFFFF"))
    text = _ass_escape(word.get("text", ""))
    duration_cs = max(1, round((float(word["end"]) - float(word["start"])) * 100))
    if animation == "karaoke":
        return f"{{\\k{duration_cs}}}{text}"
    if animation == "pop":
        return f"{{\\c{highlight}\\t(0,120,\\fscx115\\fscy115)\\t(120,220,\\fscx100\\fscy100)}}{text}"
    return f"{{\\c{primary}}}{text}"


def build_ass(subtitle_data: dict[str, Any]) -> str:
    """Return an ASS document from a subtitle/style JSON payload."""
    validate_subtitle_data(subtitle_data)
    style = subtitle_data.get("style", {})
    font = style.get("font_family", "Arial").split(",")[0].strip().strip('"')
    font_size = max(8, round(float(style.get("font_size", 54))))
    primary = _ass_color(style.get("primary_color", "#FFFFFF"))
    highlight = _ass_color(style.get("highlight_color", "#FFE600"))
    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: 1080",
        "PlayResY: 1920",
        "WrapStyle: 2",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: NovaCap,{font},{font_size},{primary},{highlight},"
        "&H00000000,&H99000000,1,0,0,0,100,100,0,0,1,3,1,5,60,60,"
        f"{round(float(style.get('position_y_percent', 70)) * 19.2)},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    for block in subtitle_data.get("blocks", []):
        words = block.get("words", [])
        if not words:
            continue
        start = min(float(word["start"]) for word in words)
        end = max(float(word["end"]) for word in words)
        text = " ".join(_word_tag(word, style) for word in words)
        lines.append(
            f"Dialogue: 0,{_ass_time(start)},{_ass_time(end)},NovaCap,,0,0,0,,{text}"
        )
    return "\n".join(lines) + "\n"


def build_ffmpeg_command(
    input_path: str,
    output_path: str,
    ass_path: str,
    *,
    preset: str = "veryfast",
    crf: int = 18,
) -> list[str]:
    """Build an argument-safe FFmpeg command for burned-in captions."""
    if preset not in {"veryfast", "faster", "fast", "medium"}:
        raise ValueError("unsupported FFmpeg preset")
    if not 0 <= crf <= 51:
        raise ValueError("CRF must be between 0 and 51")
    filter_path = ass_path.replace("\\", "/").replace(":", r"\:")
    filter_path = filter_path.replace("'", r"\'")
    return [
        "ffmpeg",
        "-y",
        "-i",
        input_path,
        "-vf",
        f"ass=filename='{filter_path}'",
        "-c:v",
        "libx264",
        "-preset",
        preset,
        "-crf",
        str(crf),
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        output_path,
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate an ASS caption file and FFmpeg command")
    parser.add_argument("subtitle_json", type=Path)
    parser.add_argument("ass_output", type=Path)
    parser.add_argument("input_video")
    parser.add_argument("output_video")
    args = parser.parse_args()

    payload = json.loads(args.subtitle_json.read_text(encoding="utf-8"))
    args.ass_output.write_text(build_ass(payload), encoding="utf-8")
    print(" ".join(shlex.quote(part) for part in build_ffmpeg_command(
        args.input_video, args.output_video, str(args.ass_output)
    )))


if __name__ == "__main__":
    main()
