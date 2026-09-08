# Simple test suite for the transcription service

import base64
import io
import wave
from fastapi.testclient import TestClient

from app.main import app
from app.transcriber import Transcriber

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_transcribe_dummy():
    audio = io.BytesIO()
    with wave.open(audio, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(b"\0\0" * 1600)
    payload = {"audioBase64": base64.b64encode(audio.getvalue()).decode(), "mimeType": "audio/wav", "wordsPerBlock": 3}
    r = client.post("/api/transcribe/whisper", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert "blocks" in data
    assert isinstance(data["blocks"], list)
    if len(data["blocks"]) > 0:
        b = data["blocks"][0]
        assert "words" in b
        assert isinstance(b["words"], list)


def test_transcribe_requires_optional_api_key(monkeypatch):
    monkeypatch.setenv("NOVACAP_WHISPER_API_KEY", "secret")
    payload = {"audioBase64": base64.b64encode(b"dummy").decode()}
    assert client.post("/api/transcribe/whisper", json=payload).status_code == 401


def test_transcribe_rejects_invalid_base64():
    response = client.post("/api/transcribe/whisper", json={"audioBase64": "not base64!"})
    assert response.status_code == 400


def test_model_aliases_resolve_to_downloadable_faster_whisper_models():
    assert Transcriber.normalize_model_name("whisper-small") == "small"
    assert Transcriber.normalize_model_name("large-v3-turbo") == "turbo"
    assert Transcriber.normalize_model_name("not-a-model") is None
