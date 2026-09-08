import asyncio
import os
import subprocess
import uuid
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException

from .render_plan import build_ass, build_ffmpeg_command
from .schemas import RenderJobResponse, RenderPlanResponse, RenderRequest

app = FastAPI(title="NovaCap Render Service", version="0.1.0")
jobs: dict[str, dict[str, object]] = {}


def _authorize(api_key: str | None) -> None:
    expected = os.getenv("NOVACAP_RENDER_API_KEY")
    if expected and api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid render API key")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/v1/render/plan", response_model=RenderPlanResponse)
async def render_plan(request: RenderRequest):
    try:
        ass = build_ass(request.subtitles)
        command = build_ffmpeg_command(
            request.input_path,
            request.output_path,
            request.ass_path,
            preset=request.preset,
            crf=request.crf,
        )
        return RenderPlanResponse(ass=ass, command=command)
    except (KeyError, TypeError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


async def _run_job(job_id: str, request: RenderRequest, ass: str, command: list[str]) -> None:
    job = jobs[job_id]
    try:
        ass_path = Path(request.ass_path)
        ass_path.parent.mkdir(parents=True, exist_ok=True)
        ass_path.write_text(ass, encoding="utf-8")
        process = await asyncio.create_subprocess_exec(*command)
        job["process"] = process
        job["status"] = "running"
        job["progress"] = 10
        return_code = await process.wait()
        if job["status"] == "cancelled":
            return
        if return_code:
            job.update(status="failed", progress=0, error=f"FFmpeg exited with {return_code}")
        else:
            job.update(status="completed", progress=100)
    except Exception as error:
        job.update(status="failed", progress=0, error=str(error))


@app.post("/v1/render/jobs", response_model=RenderJobResponse, status_code=202)
async def create_render_job(
    request: RenderRequest,
    x_api_key: str | None = Header(default=None),
):
    _authorize(x_api_key)
    try:
        ass = build_ass(request.subtitles)
        command = build_ffmpeg_command(
            request.input_path, request.output_path, request.ass_path,
            preset=request.preset, crf=request.crf,
        )
    except (KeyError, TypeError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    job_id = uuid.uuid4().hex
    jobs[job_id] = {
        "id": job_id, "status": "queued", "progress": 0,
        "output_path": request.output_path, "process": None,
    }
    asyncio.create_task(_run_job(job_id, request, ass, command))
    return RenderJobResponse(**{key: value for key, value in jobs[job_id].items() if key != "process"})


@app.get("/v1/render/jobs/{job_id}", response_model=RenderJobResponse)
async def get_render_job(job_id: str, x_api_key: str | None = Header(default=None)):
    _authorize(x_api_key)
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found")
    return RenderJobResponse(**{key: value for key, value in job.items() if key != "process"})


@app.delete("/v1/render/jobs/{job_id}", response_model=RenderJobResponse)
async def cancel_render_job(job_id: str, x_api_key: str | None = Header(default=None)):
    _authorize(x_api_key)
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found")
    process = job.get("process")
    if isinstance(process, asyncio.subprocess.Process) and process.returncode is None:
        process.terminate()
    job.update(status="cancelled", progress=0)
    return RenderJobResponse(**{key: value for key, value in job.items() if key != "process"})
