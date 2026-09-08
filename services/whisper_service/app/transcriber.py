# Lightweight Transcriber wrapper

import asyncio
import base64
import os
import uuid
from typing import Optional

from .schemas import Block, Word

class Transcriber:
    """Whisper adapter with an optional faster-whisper backend.

    The deterministic fallback keeps local development and health checks usable
    when model dependencies are unavailable; production deployments should
    install faster-whisper and set WHISPER_MODEL.
    """

    def __init__(self):
        self.backend = "dummy"
        self.model = None
        try:
            from faster_whisper import WhisperModel
            model_name = os.getenv("WHISPER_MODEL", "small")
            device = os.getenv("WHISPER_DEVICE", "auto")
            compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "default")
            self.model = WhisperModel(model_name, device=device, compute_type=compute_type)
            self.backend = "faster-whisper"
        except (ImportError, RuntimeError, OSError):
            pass

    async def transcribe_base64(self, audio_base64: str, mimeType: Optional[str] = "audio/wav",
                                language: Optional[str] = "auto", model: Optional[str] = None,
                                wordsPerBlock: int = 3, ensureWordAlignment: bool = True):
        audio_bytes = base64.b64decode(audio_base64, validate=True)
        if self.model is not None:
            return await asyncio.to_thread(
                self._transcribe_with_faster_whisper,
                audio_bytes,
                language,
                wordsPerBlock,
                ensureWordAlignment,
            )
        await asyncio.sleep(0)
        return self._generate_dummy_blocks(wordsPerBlock)

    def _transcribe_with_faster_whisper(
        self,
        audio_bytes: bytes,
        language: Optional[str],
        words_per_block: int,
        ensure_word_alignment: bool,
    ):
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as audio_file:
            audio_file.write(audio_bytes)
            audio_file.flush()
            segments, _ = self.model.transcribe(
                audio_file.name,
                language=None if not language or language == "auto" else language,
                word_timestamps=ensure_word_alignment,
                vad_filter=True,
            )
            words = []
            for segment in segments:
                for word in (segment.words or []):
                    text = word.word.strip()
                    if not text or word.end <= word.start:
                        continue
                    words.append(Word(
                        id=f"whisper-word-{uuid.uuid4().hex[:10]}",
                        text=text,
                        start=round(float(word.start), 3),
                        end=round(float(word.end), 3),
                        confidence=round(max(0.0, min(1.0, float(word.probability))), 4),
                    ))
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
