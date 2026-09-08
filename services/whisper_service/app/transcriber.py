# Lightweight Transcriber wrapper

import asyncio
import base64
import uuid
from typing import Optional

from .schemas import Block, Word

class Transcriber:
    """A minimal transcriber wrapper.

    Real implementations should integrate with whisperx or faster-whisper. This scaffold
    provides a deterministic fallback that synthesizes timed blocks so the frontend can
    integrate and tests can run without heavy ML dependencies.
    """

    def __init__(self):
        # In a real implementation, detect installed libraries / GPU here
        self.backend = "dummy"

    async def transcribe_base64(self, audio_base64: str, mimeType: Optional[str] = "audio/wav",
                                language: Optional[str] = "auto", model: Optional[str] = None,
                                wordsPerBlock: int = 3, ensureWordAlignment: bool = True):
        # decode optionally to estimate duration; for dummy we'll ignore content
        await asyncio.sleep(0)  # keep method async
        return self._generate_dummy_blocks(wordsPerBlock)

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
        return [b.dict() for b in blocks]
