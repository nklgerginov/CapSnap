from fastapi.testclient import TestClient

from services.render_service.main import app


client = TestClient(app)


def _request():
    return {
        "input_path": "input.mp4",
        "output_path": "output.mp4",
        "ass_path": "captions.ass",
        "subtitles": {
            "style": {"animation_type": "pop"},
            "blocks": [{"words": [{"text": "Go", "start": 0, "end": 0.4}]}],
        },
    }


def test_render_plan_endpoint_returns_ass_and_fast_command():
    response = client.post("/v1/render/plan", json=_request())

    assert response.status_code == 200
    command = response.json()["command"]
    assert command[command.index("-preset") + 1] == "veryfast"


def test_render_plan_endpoint_rejects_overlapping_words():
    payload = _request()
    payload["subtitles"] = {"blocks": [{"words": [
                {"text": "one", "start": 0, "end": 0.5},
                {"text": "two", "start": 0.4, "end": 0.8},
            ]}]}
    response = client.post("/v1/render/plan", json=payload)

    assert response.status_code == 422


def test_render_jobs_require_configured_api_key(monkeypatch):
    monkeypatch.setenv("NOVACAP_RENDER_API_KEY", "secret")
    response = client.post("/v1/render/jobs", json=_request())
    assert response.status_code == 401


def test_render_job_is_accepted_without_running_ffmpeg(monkeypatch, tmp_path):
    monkeypatch.delenv("NOVACAP_RENDER_API_KEY", raising=False)

    class FakeProcess:
        returncode = 0

        async def wait(self):
            return 0

    async def fake_exec(*_args):
        return FakeProcess()

    monkeypatch.setattr("services.render_service.main.asyncio.create_subprocess_exec", fake_exec)
    payload = _request()
    payload["ass_path"] = str(tmp_path / "captions.ass")
    response = client.post("/v1/render/jobs", json=payload)
    assert response.status_code == 202
    job_id = response.json()["id"]
    status = client.get(f"/v1/render/jobs/{job_id}")
    assert status.status_code == 200
