from __future__ import annotations

import os
import time
from pathlib import Path

from ..progress import current_task_id, set_progress


def sleep_task(seconds: float = 5.0, steps: int = 10, data_dir: str = ".data") -> dict:
  """
  Demo heavy task:
  - updates progress via DB-backed progress sink
  - writes a small artifact into data_dir for later result plumbing
  """
  task_id = current_task_id()
  out_dir = Path(data_dir) / "outputs" / str(task_id)
  out_dir.mkdir(parents=True, exist_ok=True)

  total = max(1, int(steps))
  sleep_s = float(seconds) / total

  set_progress(0, stage="queued", message="task started")
  for i in range(total):
    time.sleep(max(0.0, sleep_s))
    pct = int((i + 1) * 100 / total)
    set_progress(pct, stage="running", message=f"step {i + 1}/{total}")

  artifact = out_dir / "result.txt"
  artifact.write_text(f"ok task={task_id} pid={os.getpid()}\n", encoding="utf-8")
  set_progress(100, stage="done", message="completed", extra={"artifactPath": str(artifact)})
  return {"artifactPath": str(artifact)}
