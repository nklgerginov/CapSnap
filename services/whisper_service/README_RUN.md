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
- `faster-whisper` is the production backend. Models are downloaded lazily
  into the faster-whisper cache when the requested model is first used.
- Set `WHISPER_MODEL`, `WHISPER_DEVICE`, and `WHISPER_COMPUTE_TYPE` to control
  the default model and hardware. A request can override the model with
  `whisper-tiny`, `whisper-base`, `whisper-small`, `whisper-medium`,
  `whisper-large-v3`, or `whisper-large-v3-turbo`.
- The deterministic dummy response is only available when faster-whisper is
  not installed and is not suitable for production accuracy.
