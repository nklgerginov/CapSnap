from fastapi.testclient import TestClient

from services.render_service.main import app


client = TestClient(app)


def test_render_plan_endpoint_returns_ass_and_fast_command():
    response = client.post("/v1/render/plan", json={
        "input_path": "input.mp4",
        "output_path": "output.mp4",
        "ass_path": "captions.ass",
        "subtitles": {
            "style": {"animation_type": "pop"},
            "blocks": [{"words": [{"text": "Go", "start": 0, "end": 0.4}]}],
        },
    })

    assert response.status_code == 200
    command = response.json()["command"]
    assert command[command.index("-preset") + 1] == "veryfast"


def test_render_plan_endpoint_rejects_overlapping_words():
    response = client.post("/v1/render/plan", json={
        "input_path": "input.mp4",
        "output_path": "output.mp4",
        "ass_path": "captions.ass",
        "subtitles": {
            "blocks": [{"words": [
                {"text": "one", "start": 0, "end": 0.5},
                {"text": "two", "start": 0.4, "end": 0.8},
            ]}],
        },
    })

    assert response.status_code == 422
