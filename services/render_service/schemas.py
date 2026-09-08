from typing import Any

from pydantic import BaseModel, Field


class RenderRequest(BaseModel):
    input_path: str = Field(min_length=1, max_length=1024)
    output_path: str = Field(min_length=1, max_length=1024)
    ass_path: str = Field(min_length=1, max_length=1024)
    subtitles: dict[str, Any]
    preset: str = Field("veryfast", pattern="^(veryfast|faster|fast|medium)$")
    crf: int = Field(18, ge=0, le=51)


class RenderPlanResponse(BaseModel):
    ass: str
    command: list[str]
