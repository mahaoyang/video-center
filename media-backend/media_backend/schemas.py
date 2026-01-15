from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel, Field


class DemoSleepRequest(BaseModel):
  seconds: float = Field(default=5.0, ge=0.0)
  steps: int = Field(default=10, ge=1, le=200)


class EnqueueResult(BaseModel):
  id: str


class TaskStatusResult(BaseModel):
  id: str
  status: str
  progress: int = 0
  stage: str = ""
  message: str = ""
  meta: dict[str, Any] = {}
  result: Optional[Any] = None
  error: Optional[str] = None


class FfmpegCommandSpec(BaseModel):
  args: list[str] = Field(min_length=1)
  cwd: Optional[str] = None
  env: Optional[dict[str, Optional[str]]] = None
  timeoutMs: Optional[int] = Field(default=None, ge=1)
  durationHintSeconds: Optional[float] = Field(default=None, ge=0.0)


class FfmpegPipelineRequest(BaseModel):
  label: str = Field(default="ffmpeg-pipeline")
  commands: list[FfmpegCommandSpec] = Field(min_length=1)
  fallbackCommands: Optional[list[FfmpegCommandSpec]] = None


class FfmpegCandidateSpec(BaseModel):
  label: str = Field(default="candidate")
  encodeCount: Optional[int] = Field(default=None, ge=0, description="Lower is faster: number of commands that require re-encode/transcode.")
  score: Optional[float] = Field(default=None, description="Lower is faster (expected).")
  commands: list[FfmpegCommandSpec] = Field(min_length=1)
  fallbackCommands: Optional[list[FfmpegCommandSpec]] = None


class FfmpegSearchRequest(BaseModel):
  label: str = Field(default="ffmpeg-search")
  candidates: list[FfmpegCandidateSpec] = Field(min_length=1)
