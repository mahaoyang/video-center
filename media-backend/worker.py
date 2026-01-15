from __future__ import annotations

import os
import socket
import time
from typing import Any

import psycopg
from psycopg.rows import dict_row

from media_backend.progress import bind_progress, unbind_progress
from media_backend.queue import QueueContext, claim_next_task, ensure_schema, fail_task, finish_task, update_task_progress
from media_backend.settings import load_settings
from media_backend.tasks.demo import sleep_task
from media_backend.tasks.ffmpeg_pipeline import run_pipeline
from media_backend.tasks.ffmpeg_search import run_search
from media_backend.tasks.ffmpeg_stub import probe_ffmpeg


def make_worker_id() -> str:
  host = socket.gethostname()
  return f"{host}:{os.getpid()}"


def make_progress_sink(conn: psycopg.Connection, task_id: str):
  def sink(progress: int, stage: str, message: str, extra: dict[str, Any] | None) -> None:
    update_task_progress(conn=conn, task_id=task_id, progress=progress, stage=stage, message=message, extra=extra)

  return sink


def run_one(ctx: QueueContext, worker_id: str) -> bool:
  task = claim_next_task(ctx, worker_id=worker_id)
  if not task:
    return False

  task_id = str(task.get("id") or "")
  kind = str(task.get("kind") or "")
  payload = task.get("payload") or {}
  if not isinstance(payload, dict):
    payload = {}

  settings = load_settings()
  with psycopg.connect(settings.database_url, row_factory=dict_row) as conn:
    tokens = bind_progress(task_id, make_progress_sink(conn, task_id))
    try:
      if kind == "demo.sleep":
        seconds = float(payload.get("seconds") or 0.0)
        steps = int(payload.get("steps") or 10)
        result = sleep_task(seconds=seconds, steps=steps, data_dir=settings.data_dir)
        finish_task(conn=conn, task_id=task_id, result=result)
        return True

      if kind == "ffmpeg.probe":
        result = probe_ffmpeg(data_dir=settings.data_dir)
        finish_task(conn=conn, task_id=task_id, result=result)
        return True

      if kind == "ffmpeg.pipeline":
        label = str(payload.get("label") or "ffmpeg-pipeline")
        commands = payload.get("commands") or []
        fallback_commands = payload.get("fallback_commands") or None
        result = run_pipeline(label=label, commands=commands, fallback_commands=fallback_commands)
        finish_task(conn=conn, task_id=task_id, result=result)
        return True

      if kind == "ffmpeg.search":
        label = str(payload.get("label") or "ffmpeg-search")
        candidates = payload.get("candidates") or []
        result = run_search(label=label, candidates=candidates)
        finish_task(conn=conn, task_id=task_id, result=result)
        return True

      raise ValueError(f"unknown task kind: {kind}")
    except Exception as e:
      fail_task(conn=conn, task_id=task_id, error=str(e))
      return True
    finally:
      unbind_progress(tokens)


def main():
  settings = load_settings()
  ctx = QueueContext(database_url=settings.database_url)
  ensure_schema(ctx)
  os.makedirs(settings.data_dir, exist_ok=True)

  worker_id = make_worker_id()
  print(f"[media-backend worker] starting (worker_id={worker_id})")

  idle_s = float(os.environ.get("WORKER_IDLE_SLEEP", "0.3"))
  while True:
    did = run_one(ctx, worker_id=worker_id)
    if not did:
      time.sleep(idle_s)


if __name__ == "__main__":
  main()

