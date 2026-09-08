from typing import Optional
from pydantic import BaseModel, Field

class TranscribeRequest(BaseModel):
    audioBase64: str = Field(..., description="Base64-encoded audio payload (wav/mp3/ogg)")
    mimeType: Optional[str] = Field("audio/wav")
    language: Optional[str] = Field("auto")
    model: Optional[str] = Field(None)
    wordsPerBlock: Optional[int] = Field(3)
    ensureWordAlignment: Optional[bool] = Field(True)

class Word(BaseModel):
    id: str
    text: str
    start: float
    end: float
    confidence: Optional[float] = None
    emoji: Optional[str] = None
    isEmphasized: Optional[bool] = False
    colorOverride: Optional[str] = None
    sentiment: Optional[str] = None

class Block(BaseModel):
    id: str
    start: float
    end: float
    mood: Optional[str] = None
    suggestedEmoji: Optional[str] = None
    words: list[Word]

class TranscribeResponse(BaseModel):
    blocks: list[Block]
