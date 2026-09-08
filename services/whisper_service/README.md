# Whisper Transcription Service (FastAPI)

This service provides a /api/transcribe/whisper endpoint that returns word-level subtitle blocks.

The service loads `faster-whisper` models lazily on the first request. If the
selected model is not in the local model cache, `faster-whisper` downloads it
automatically and reuses it for later requests. Supported aliases include
`whisper-tiny`, `whisper-base`, `whisper-small`, `whisper-medium`,
`whisper-large-v3`, and `whisper-large-v3-turbo`.

The deterministic dummy response is retained only when `faster-whisper` is not
installed, which keeps local health checks usable but must not be treated as a
production transcription backend.

See README.md for usage.
