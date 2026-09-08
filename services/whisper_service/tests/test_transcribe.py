# Simple test suite for the transcription service

import base64
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_transcribe_dummy():
    # send a placeholder base64 payload; the dummy transcriber ignores content
    payload = {"audioBase64": base64.b64encode(b"dummy").decode(), "mimeType": "audio/wav", "wordsPerBlock": 3}
    r = client.post("/api/transcribe/whisper", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert "blocks" in data
    assert isinstance(data["blocks"], list)
    if len(data["blocks"]) > 0:
        b = data["blocks"][0]
        assert "words" in b
        assert isinstance(b["words"], list)
