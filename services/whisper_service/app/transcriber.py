# Lightweight Transcriber wrapper

import asyncio
import base64
import os
import threading
import uuid
from pathlib import Path
from typing import Optional

from .schemas import Block, Word

class Transcriber:
    """Whisper adapter with an optional faster-whisper backend.

    When faster-whisper is unavailable, the service reports no recognized
    speech rather than fabricating transcript text.
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

    def _get_model(self, requested_model: Optional[str], device_override: str | None = None) -> object | None:
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
                device = device_override or os.getenv("WHISPER_DEVICE", "auto")
                compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "default")
                # faster-whisper downloads the selected CTranslate2 model into
                # its cache on first use and reuses it thereafter.
                try:
                    self.models[model_name] = WhisperModel(
                        model_name, device=device, compute_type=compute_type
                    )
                except (OSError, RuntimeError) as error:
                    # "auto" can select CUDA on machines with an incomplete
                    # runtime. Retry on CPU so local transcription still works.
                    message = str(error).lower()
                    if device != "auto" or not any(
                        marker in message for marker in ("cuda", "cublas", "cudnn")
                    ):
                        raise
                    self.models[model_name] = WhisperModel(
                        model_name, device="cpu", compute_type="int8"
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
            try:
                return await asyncio.to_thread(
                    self._transcribe_with_faster_whisper,
                    audio_bytes,
                    mimeType,
                    language,
                    wordsPerBlock,
                    ensureWordAlignment,
                    model_instance,
                )
            except (OSError, RuntimeError) as error:
                message = str(error).lower()
                if "cuda" not in message and "cublas" not in message and "cudnn" not in message:
                    raise
                model_name = self.normalize_model_name(
                    model or os.getenv("WHISPER_MODEL", "small")
                )
                if not model_name:
                    raise
                self.models.pop(model_name, None)
                cpu_model = await asyncio.to_thread(
                    self._get_model, model_name, "cpu"
                )
                return await asyncio.to_thread(
                    self._transcribe_with_faster_whisper,
                    audio_bytes,
                    mimeType,
                    language,
                    wordsPerBlock,
                    ensureWordAlignment,
                    cpu_model,
                )
        await asyncio.sleep(0)
        return []

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
        # Windows keeps NamedTemporaryFile handles locked, so close the file
        # before faster-whisper/FFmpeg opens it and remove it explicitly.
        audio_path = None
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as audio_file:
            audio_path = Path(audio_file.name)
            audio_file.write(audio_bytes)
            audio_file.flush()
        try:
            segments, _ = model_instance.transcribe(
                str(audio_path),
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
        finally:
            if audio_path is not None:
                audio_path.unlink(missing_ok=True)

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
