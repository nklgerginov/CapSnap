# Lightweight Transcriber wrapper

import asyncio
import base64
import os
import threading
import uuid
from typing import Optional

from .schemas import Block, Word

class Transcriber:
    """Whisper adapter with an optional faster-whisper backend.

    The deterministic fallback keeps local development and health checks usable
    when model dependencies are unavailable; production deployments should
    install faster-whisper and set WHISPER_MODEL.
    """

    SUPPORTED_MODELS = {
        "tiny": "tiny",
        "base": "base",
        "small": "small",
        "medium": "medium",
        "large-v3": "large-v3",
        "turbo": "turbo",
        "large-v3-turbo": "turbo",
    }

    def __init__(self):
        self.backend = "dummy"
        self.models: dict[str, object] = {}
        self._model_lock = threading.Lock()
        try:
            import faster_whisper  # noqa: F401
            self.backend = "faster-whisper"
        except ImportError:
            pass

    def _get_model(self, requested_model: Optional[str]) -> object | None:
        if self.backend != "faster-whisper":
            return None
        from faster_whisper import WhisperModel

        configured = requested_model or os.getenv("WHISPER_MODEL", "small")
        model_name = self.normalize_model_name(configured)
        if not model_name:
            raise ValueError(f"Unsupported Whisper model: {configured}")
        if model_name in self.models:
            return self.models[model_name]

        with self._model_lock:
            if model_name not in self.models:
                device = os.getenv("WHISPER_DEVICE", "auto")
                compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "default")
                # faster-whisper downloads the selected CTranslate2 model into
                # its cache on first use and reuses it thereafter.
                self.models[model_name] = WhisperModel(
                    model_name, device=device, compute_type=compute_type
                )
        return self.models[model_name]

    @classmethod
    def normalize_model_name(cls, requested_model: str) -> str | None:
        normalized = requested_model.strip().lower().removeprefix("whisper-")
        return cls.SUPPORTED_MODELS.get(normalized)

    async def transcribe_base64(self, audio_base64: str, mimeType: Optional[str] = "audio/wav",
                                language: Optional[str] = "auto", model: Optional[str] = None,
                                wordsPerBlock: int = 3, ensureWordAlignment: bool = True):
        audio_bytes = base64.b64decode(audio_base64, validate=True)
        model_instance = await asyncio.to_thread(self._get_model, model)
        if model_instance is not None:
            return await asyncio.to_thread(
                self._transcribe_with_faster_whisper,
                audio_bytes,
                mimeType,
                language,
                wordsPerBlock,
                ensureWordAlignment,
                model_instance,
            )
        await asyncio.sleep(0)
        return self._generate_dummy_blocks(wordsPerBlock)

    def _transcribe_with_faster_whisper(
        self,
        audio_bytes: bytes,
        mime_type: Optional[str],
        language: Optional[str],
        words_per_block: int,
        ensure_word_alignment: bool,
        model_instance: object,
    ):
        import tempfile

        suffix = {
            "audio/wav": ".wav",
            "audio/x-wav": ".wav",
            "audio/mpeg": ".mp3",
            "audio/mp3": ".mp3",
            "audio/ogg": ".ogg",
            "audio/webm": ".webm",
            "audio/mp4": ".m4a",
        }.get((mime_type or "audio/wav").split(";", 1)[0].lower(), ".wav")
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as audio_file:
            audio_file.write(audio_bytes)
            audio_file.flush()
            segments, _ = model_instance.transcribe(
                audio_file.name,
                language=None if not language or language == "auto" else language,
                word_timestamps=ensure_word_alignment,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 350, "speech_pad_ms": 180},
                beam_size=5,
                best_of=5,
                condition_on_previous_text=False,
            )
            words = []
            previous_end = 0.0
            for segment in segments:
                for word in (segment.words or []):
                    text = word.word.strip()
                    if not text or word.end <= word.start:
                        continue
                    start = max(previous_end, round(float(word.start), 3))
                    end = round(float(word.end), 3)
                    if end <= start:
                        continue
                    words.append(Word(
                        id=f"whisper-word-{uuid.uuid4().hex[:10]}",
                        text=text,
                        start=start,
                        end=end,
                        confidence=round(max(0.0, min(1.0, float(word.probability or 0.0))), 4),
                    ))
                    previous_end = end
            return self._group_words(words, words_per_block)

    def _group_words(self, words: list[Word], words_per_block: int):
        blocks = []
        for index in range(0, len(words), words_per_block):
            chunk = words[index:index + words_per_block]
            if not chunk:
                continue
            block = Block(
                id=f"whisper-block-{uuid.uuid4().hex[:10]}",
                start=chunk[0].start,
                end=chunk[-1].end,
                words=chunk,
            )
            blocks.append(block.model_dump() if hasattr(block, "model_dump") else block.dict())
        return blocks

    def _generate_dummy_blocks(self, words_per_block: int = 3):
        sample_text = "This CRAZY hack will change how you make short videos and captions"
        words = sample_text.split()
        blocks = []
        t = 0.0
        dur_per_word = 0.35
        b_idx = 0
        for i in range(0, len(words), words_per_block):
            w_chunk = words[i:i+words_per_block]
            start = round(t, 3)
            words_list = []
            for j, w in enumerate(w_chunk):
                w_start = round(t + j * dur_per_word, 3)
                w_end = round(w_start + dur_per_word, 3)
                words_list.append(Word(
                    id=f"ai-word-{b_idx}-{j}-{uuid.uuid4().hex[:6]}",
                    text=w,
                    start=w_start,
                    end=w_end,
                    confidence=0.95,
                    emoji=None,
                    isEmphasized=w.isupper(),
                ))
            t = (words_list[-1].end if words_list else t) + 0.1
            block = Block(
                id=f"ai-block-{b_idx}-{uuid.uuid4().hex[:6]}",
                start=start,
                end=round(t, 3),
                mood="hype",
                suggestedEmoji="🔥",
                words=words_list,
            )
            blocks.append(block)
            b_idx += 1
        # Convert to plain dicts for JSON serialization
        return [b.model_dump() if hasattr(b, "model_dump") else b.dict() for b in blocks]
