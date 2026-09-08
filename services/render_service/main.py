from fastapi import FastAPI, HTTPException

from .render_plan import build_ass, build_ffmpeg_command
from .schemas import RenderPlanResponse, RenderRequest

app = FastAPI(title="NovaCap Render Service", version="0.1.0")


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
