from typing import Any

from pydantic import BaseModel, Field


class RenderRequest(BaseModel):
    input_path: str = Field(min_length=1, max_length=1024)
    output_path: str = Field(min_length=1, max_length=1024)
    ass_path: str = Field(min_length=1, max_length=1024)
    subtitles: dict[str, Any]
    preset: str = Field("veryfast", pattern="^(veryfast|faster|fast|medium)$")
    crf: int = Field(18, ge=0, le=51)
    duration_seconds: float | None = Field(default=None, gt=0, le=24 * 60 * 60)


class RenderPlanResponse(BaseModel):
    ass: str
    command: list[str]


class RenderJobResponse(BaseModel):
    id: str
    status: str
    progress: int = Field(ge=0, le=100)
    output_path: str
    error: str | None = None
