from services.render_service.render_plan import build_ass, build_ffmpeg_command


def test_build_ass_preserves_word_timing_and_pop_animation():
    result = build_ass({
        "style": {
            "font_family": '"Plus Jakarta Sans", sans-serif',
            "font_size": 72,
            "primary_color": "#FFFFFF",
            "highlight_color": "#FFE600",
            "animation_type": "pop",
            "position_y_percent": 70,
        },
        "blocks": [{
            "words": [
                {"text": "Hook", "start": 0.2, "end": 0.5},
                {"text": "now", "start": 0.5, "end": 0.9},
            ],
        }],
    })

    assert "Dialogue: 0,0:00:00.20,0:00:00.90" in result
    assert r"\fscx115" in result
    assert "Hook" in result


def test_ffmpeg_command_uses_ass_filter_and_safe_arguments():
    command = build_ffmpeg_command("input clip.mp4", "output clip.mp4", "captions.ass")

    assert command[0] == "ffmpeg"
    assert command[command.index("-vf") + 1] == "ass=filename='captions.ass'"
    assert command[command.index("-progress") + 1] == "pipe:1"
    assert command[-1] == "output clip.mp4"


def test_build_ass_preserves_css_alpha_colors():
    result = build_ass({
        "style": {"primary_color": "#11223380"},
        "blocks": [{"words": [{"text": "alpha", "start": 0, "end": 0.2}]}],
    })

    assert "Style: NovaCap,Arial,54,&H80332211" in result
