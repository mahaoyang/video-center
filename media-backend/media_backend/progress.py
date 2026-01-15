from __future__ import annotations

import time
from contextvars import ContextVar
from typing import Any, Callable, Optional

ProgressSink = Callable[[int, str, str, Optional[dict[str, Any]]], None]

_sink: ContextVar[Optional[ProgressSink]] = ContextVar("media_backend_progress_sink", default=None)
_task_id: ContextVar[str] = ContextVar("media_backend_task_id", default="unknown")

def bind_progress(task_id: str, sink: ProgressSink):
  """
  Bind a task-scoped progress sink (e.g. DB updater) to the current execution context.
  Returns a token you can use to reset (ContextVar token).
  """
  t1 = _task_id.set(str(task_id))
  t2 = _sink.set(sink)
  return (t1, t2)


def unbind_progress(tokens) -> None:
  t1, t2 = tokens
  _task_id.reset(t1)
  _sink.reset(t2)


def current_task_id() -> str:
  return str(_task_id.get() or "unknown")


def set_progress(progress: int, *, stage: str = "", message: str = "", extra: Optional[dict[str, Any]] = None) -> None:
  sink = _sink.get()
  if sink is None:
    return
  p = int(progress)
  if p < 0:
    p = 0
  if p > 100:
    p = 100
  sink(p, str(stage or ""), str(message or ""), extra)
