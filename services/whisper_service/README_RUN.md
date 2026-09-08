# Services/Whisper Service - quick run instructions

From the repo root:

1. Install dependencies (prefer a virtualenv)

   cd services/whisper_service
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt

2. Run locally with uvicorn

   uvicorn app.main:app --reload --port 8080

3. Test with curl

   curl -X POST http://localhost:8080/api/transcribe/whisper \
     -H "Content-Type: application/json" \
     -d '{"audioBase64": "ZG9udGFjdCB5ZXQ=", "mimeType": "audio/wav", "wordsPerBlock": 3}'

Notes:
- This scaffold provides a deterministic dummy transcriber. Replace app/transcriber.py with a real WhisperX or faster-whisper integration.
