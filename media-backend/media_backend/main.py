from __future__ import annotations

import asyncio
import json
import os
from typing import AsyncIterator, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .api_types import ok
from .queue import create_queue, ensure_schema, enqueue, fetch_task, QueueContext
from .schemas import DemoSleepRequest, EnqueueResult, TaskStatusResult, FfmpegPipelineRequest, FfmpegSearchRequest
from .settings import load_settings

settings = load_settings()
ctx: QueueContext = create_queue(settings)
ensure_schema(ctx)

app = FastAPI(title="media-backend", version="0.1.0")
app.add_middleware(
  CORSMiddleware,
  allow_origins=settings.cors_allow_origins,
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)


def task_status(row: dict) -> TaskStatusResult:
  status = str(row.get("status") or "")
  progress = int(row.get("progress") or 0)
  stage = str(row.get("stage") or "")
  message = str(row.get("message") or "")
  meta = row.get("meta") or {}
  if not isinstance(meta, dict):
    meta = {}

  err: Optional[str] = None
  if status == "failed":
    err = str(row.get("error") or meta.get("error") or "failed")

  result = row.get("result") if status == "finished" else None

  return TaskStatusResult(
    id=str(row.get("id") or ""),
    status=status,
    progress=progress,
    stage=stage,
    message=message,
    meta={k: v for k, v in meta.items() if k not in ("progress", "stage", "message")},
    result=result,
    error=err,
  )


@app.get("/health")
def health():
  return ok({"status": "ok"})


@app.post("/api/tasks/demo/sleep")
def enqueue_demo_sleep(body: DemoSleepRequest):
  task_id = enqueue(ctx, kind="demo.sleep", label="demo-sleep", payload={"seconds": body.seconds, "steps": body.steps})
  return ok(EnqueueResult(id=task_id))


@app.post("/api/tasks/ffmpeg/probe")
def enqueue_ffmpeg_probe():
  task_id = enqueue(ctx, kind="ffmpeg.probe", label="ffmpeg-probe", payload={})
  return ok(EnqueueResult(id=task_id))


@app.post("/api/tasks/ffmpeg/pipeline")
def enqueue_ffmpeg_pipeline(body: FfmpegPipelineRequest):
  payload = {
    "label": body.label,
    "commands": [c.model_dump() for c in body.commands],
    "fallback_commands": [c.model_dump() for c in body.fallbackCommands] if body.fallbackCommands else None,
  }
  task_id = enqueue(ctx, kind="ffmpeg.pipeline", label=body.label, payload=payload)
  return ok(EnqueueResult(id=task_id))


@app.post("/api/tasks/ffmpeg/search")
def enqueue_ffmpeg_search(body: FfmpegSearchRequest):
  payload = {
    "label": body.label,
    "candidates": [c.model_dump() for c in body.candidates],
  }
  task_id = enqueue(ctx, kind="ffmpeg.search", label=body.label, payload=payload)
  return ok(EnqueueResult(id=task_id))


@app.get("/api/tasks/{task_id}")
def get_task(task_id: str):
  try:
    row = fetch_task(ctx, task_id)
  except Exception as e:
    raise HTTPException(status_code=404, detail=str(e))
  return ok(task_status(row))


@app.get("/api/tasks/{task_id}/events")
async def task_events(task_id: str):
  async def gen() -> AsyncIterator[bytes]:
    last_seq = -1
    while True:
      try:
        row = fetch_task(ctx, task_id)
      except Exception:
        payload = {"type": "error", "message": "task not found"}
        yield f"event: error\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")
        return

      meta = row.get("meta") or {}
      if not isinstance(meta, dict):
        meta = {}
      seq = int(row.get("seq") or meta.get("seq") or 0)
      if seq != last_seq:
        last_seq = seq
        payload = task_status(row).model_dump()
        yield f"event: progress\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")

      status = str(row.get("status") or "")
      if status == "finished":
        payload = task_status(row).model_dump()
        yield f"event: done\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")
        return
      if status == "failed":
        payload = task_status(row).model_dump()
        yield f"event: failed\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")
        return

      await asyncio.sleep(0.5)

  headers = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  }
  return StreamingResponse(gen(), media_type="text/event-stream", headers=headers)


if __name__ == "__main__":
  import uvicorn

  port = int(os.environ.get("PORT", "9010"))
  uvicorn.run("media_backend.main:app", host="0.0.0.0", port=port, reload=True)
