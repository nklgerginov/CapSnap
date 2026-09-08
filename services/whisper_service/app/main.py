from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import base64
import os
from pydantic import ValidationError

from app.schemas import TranscribeRequest
from app.transcriber import Transcriber

app = FastAPI(title="CapSnap Whisper Transcription Service", version="0.1.0")

# CORS (adjust origins in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

transcriber = Transcriber()

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/api/transcribe/whisper")
async def transcribe(req: TranscribeRequest):
    # Basic validation
    if not req.audioBase64:
        raise HTTPException(status_code=400, detail="audioBase64 is required")

    try:
        # Optionally validate base64
        _ = base64.b64decode(req.audioBase64, validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail="audioBase64 is not valid base64")

    try:
        blocks = await transcriber.transcribe_base64(
            req.audioBase64,
            mimeType=req.mimeType,
            language=req.language,
            model=req.model,
            wordsPerBlock=req.wordsPerBlock or 3,
            ensureWordAlignment=bool(req.ensureWordAlignment),
        )

        return {"blocks": blocks}
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        # Don't leak internal errors; log in real service
        raise HTTPException(status_code=500, detail="Transcription failed: " + str(e))
