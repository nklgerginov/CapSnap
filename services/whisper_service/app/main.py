from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import base64
import binascii
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


def authorize(api_key: str | None) -> None:
    expected = os.getenv("NOVACAP_WHISPER_API_KEY")
    if expected and api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid Whisper API key")

@app.get("/health")
async def health():
    return {"status": "ok", "backend": transcriber.backend}

@app.post("/api/transcribe/whisper")
async def transcribe(req: TranscribeRequest, x_api_key: str | None = Header(default=None)):
    authorize(x_api_key)
    # Basic validation
    if not req.audioBase64:
        raise HTTPException(status_code=400, detail="audioBase64 is required")

    try:
        decoded = base64.b64decode(req.audioBase64, validate=True)
    except (ValueError, binascii.Error):
        raise HTTPException(status_code=400, detail="audioBase64 is not valid base64")
    if len(decoded) > 250 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="audio payload exceeds 250 MB limit")

    try:
        blocks = await transcriber.transcribe_base64(
            req.audioBase64,
            mimeType=req.mimeType,
            language=req.language,
            model=req.model,
            wordsPerBlock=req.wordsPerBlock or 3,
            ensureWordAlignment=bool(req.ensureWordAlignment),
        )

        return {"blocks": blocks, "backend": transcriber.backend, "model": req.model}
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        # Don't leak internal errors; log in real service
        raise HTTPException(status_code=500, detail="Transcription failed: " + str(e))
