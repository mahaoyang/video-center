from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from ..progress import current_task_id, set_progress


def probe_ffmpeg(data_dir: str = ".data") -> dict:
  """
  Placeholder task:
  - verifies `ffmpeg` exists
  - returns version info (for smoke test)
  """
  task_id = current_task_id()
  out_dir = Path(data_dir) / "outputs" / str(task_id)
  out_dir.mkdir(parents=True, exist_ok=True)

  set_progress(5, stage="probe", message="checking ffmpeg")
  exe = shutil.which("ffmpeg")
  if not exe:
    set_progress(100, stage="error", message="ffmpeg not found")
    raise RuntimeError("ffmpeg not found in PATH")

  set_progress(20, stage="probe", message="running ffmpeg -version")
  cp = subprocess.run([exe, "-version"], capture_output=True, text=True, check=False)
  ver = (cp.stdout or cp.stderr or "").splitlines()[:3]

  out = out_dir / "ffmpeg_version.txt"
  out.write_text("\n".join(ver) + "\n", encoding="utf-8")
  set_progress(100, stage="done", message="ffmpeg OK", extra={"artifactPath": str(out)})
  return {"ffmpegPath": exe, "versionLines": ver, "artifactPath": str(out)}
