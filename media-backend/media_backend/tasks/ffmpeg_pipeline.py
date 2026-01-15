from __future__ import annotations

import os
import re
import subprocess
import time
from dataclasses import dataclass
from typing import Optional

from ..progress import current_task_id, set_progress

import select
import fcntl

_TIME_PATTERN = re.compile(r"time=\s*(\d+:\d+:\d+(?:\.\d+)?)", re.IGNORECASE)
_FRAME_PATTERN = re.compile(r"frame=\s*(\d+)", re.IGNORECASE)
_FPS_PATTERN = re.compile(r"fps=\s*([\d.]+)", re.IGNORECASE)
_SPEED_PATTERN = re.compile(r"speed=\s*([\d.+-]+)x", re.IGNORECASE)
_SIZE_PATTERN = re.compile(r"size=\s*([\d.]+)(kB|KB|mB|MB|gB|GB)", re.IGNORECASE)
_BITRATE_PATTERN = re.compile(r"bitrate=\s*([\d.]+)kbits/s", re.IGNORECASE)

_KV_REQUIRED_KEYS = {"frame", "fps", "out_time_ms", "total_size", "bitrate", "speed", "progress"}


def _normalize_time_to_seconds(raw: str) -> Optional[float]:
  try:
    parts = [float(x) for x in raw.split(":")]
    if len(parts) != 3:
      return None
    h, m, s = parts
    return h * 3600.0 + m * 60.0 + s
  except Exception:
    return None


def _parse_size_to_kb(value: str, unit: str) -> Optional[float]:
  try:
    n = float(value)
  except Exception:
    return None
  u = unit.lower()
  if u == "kb":
    return n
  if u == "mb":
    return n * 1024.0
  if u == "gb":
    return n * 1024.0 * 1024.0
  return None


@dataclass
class ParsedProgress:
  raw: str
  frame: Optional[int] = None
  fps: Optional[float] = None
  timeSeconds: Optional[float] = None
  speed: Optional[float] = None
  totalSizeKb: Optional[float] = None
  bitrateKbps: Optional[float] = None


def _parse_classic_progress_line(line: str) -> Optional[ParsedProgress]:
  if "frame=" not in line and "time=" not in line:
    return None

  p = ParsedProgress(raw=line)

  m = _FRAME_PATTERN.search(line)
  if m:
    try:
      p.frame = int(m.group(1))
    except Exception:
      pass
  m = _FPS_PATTERN.search(line)
  if m:
    try:
      p.fps = float(m.group(1))
    except Exception:
      pass
  m = _TIME_PATTERN.search(line)
  if m:
    p.timeSeconds = _normalize_time_to_seconds(m.group(1))
  m = _SPEED_PATTERN.search(line)
  if m:
    try:
      p.speed = float(m.group(1))
    except Exception:
      pass
  m = _SIZE_PATTERN.search(line)
  if m:
    p.totalSizeKb = _parse_size_to_kb(m.group(1), m.group(2))
  m = _BITRATE_PATTERN.search(line)
  if m:
    try:
      p.bitrateKbps = float(m.group(1))
    except Exception:
      pass

  meaningful = [k for k, v in p.__dict__.items() if k != "raw" and v is not None]
  if len(meaningful) < 2:
    return None
  return p


def _parse_speed_value(raw: str) -> Optional[float]:
  s = str(raw or "").strip().lower()
  if s.endswith("x"):
    s = s[:-1]
  try:
    v = float(s)
    return v if v >= 0 else None
  except Exception:
    return None


def _parse_bitrate_kbps(raw: str) -> Optional[float]:
  s = str(raw or "").strip().lower()
  if not s:
    return None
  m = re.search(r"([\d.]+)\s*kbits/s", s)
  if not m:
    return None
  try:
    return float(m.group(1))
  except Exception:
    return None


def _parse_kv_progress_block(block: dict[str, str], raw_lines: list[str]) -> Optional[ParsedProgress]:
  # minimal required keys; ffmpeg may omit bitrate early.
  if not block:
    return None

  p = ParsedProgress(raw="\n".join(raw_lines))
  if "frame" in block:
    try:
      p.frame = int(float(block["frame"]))
    except Exception:
      pass
  if "fps" in block:
    try:
      p.fps = float(block["fps"])
    except Exception:
      pass
  if "out_time_ms" in block:
    try:
      p.timeSeconds = float(block["out_time_ms"]) / 1_000_000.0
    except Exception:
      pass
  if "speed" in block:
    p.speed = _parse_speed_value(block.get("speed", ""))
  if "total_size" in block:
    try:
      p.totalSizeKb = float(block["total_size"]) / 1024.0
    except Exception:
      pass
  if "bitrate" in block:
    p.bitrateKbps = _parse_bitrate_kbps(block.get("bitrate", ""))

  meaningful = [k for k, v in p.__dict__.items() if k != "raw" and v is not None]
  if len(meaningful) < 2:
    return None
  return p


def _sanitize_env(env: Optional[dict]) -> dict[str, str]:
  out: dict[str, str] = {}
  if not env:
    return out
  for k, v in env.items():
    if not k:
      continue
    if v is None:
      continue
    out[str(k)] = str(v)
  return out


def _pct_from_time(time_s: Optional[float], duration_hint_s: Optional[float]) -> Optional[int]:
  if time_s is None or duration_hint_s is None:
    return None
  if duration_hint_s <= 0:
    return None
  p = int(max(0.0, min(99.0, (time_s / duration_hint_s) * 100.0)))
  return p


def _run_single_ffmpeg_command(
  *,
  args: list[str],
  cwd: Optional[str],
  env: Optional[dict],
  timeout_ms: Optional[int],
  duration_hint_s: Optional[float],
  step_index: int,
  step_total: int,
  ffmpeg_context: Optional[dict] = None,
) -> dict:
  task_id = current_task_id()
  merged_env = {**os.environ, **_sanitize_env(env)}

  cmd_str = "ffmpeg " + " ".join(args)
  set_progress(
    int((step_index / max(1, step_total)) * 100),
    stage="ffmpeg",
    message=f"[{step_index + 1}/{step_total}] start",
    extra={
      "ffmpeg": {
        "jobId": task_id,
        "step": step_index,
        "steps": step_total,
        "command": cmd_str,
        "status": "running",
      }
    },
  )

  started = time.monotonic()
  timeout_s = (timeout_ms / 1000.0) if timeout_ms else None

  proc = subprocess.Popen(
    ["ffmpeg", *args],
    cwd=cwd or None,
    env=merged_env,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    bufsize=0,
  )

  stdout_lines: list[str] = []
  stderr_lines: list[str] = []
  last_emit = 0.0
  last_progress_raw: Optional[str] = None
  last_parsed: Optional[ParsedProgress] = None

  def emit_progress(parsed: Optional[ParsedProgress], raw: str) -> None:
    nonlocal last_emit, last_progress_raw, last_parsed
    now = time.monotonic()
    if now - last_emit < 0.2 and raw == last_progress_raw:
      return
    last_emit = now
    last_progress_raw = raw
    last_parsed = parsed

    pct_in_step = _pct_from_time(parsed.timeSeconds if parsed else None, duration_hint_s)
    base = int((step_index / max(1, step_total)) * 100)
    step_span = int(100 / max(1, step_total))
    pct = base
    if pct_in_step is not None:
      pct = min(99, base + int((pct_in_step / 100) * max(1, step_span)))

    ctx = dict(ffmpeg_context or {})
    extra = {
      "ffmpeg": {
        "jobId": task_id,
        "step": step_index,
        "steps": step_total,
        "command": cmd_str,
        "status": "running",
        **ctx,
        "progress": {
          "raw": raw,
          "frame": parsed.frame if parsed else None,
          "fps": parsed.fps if parsed else None,
          "timeSeconds": parsed.timeSeconds if parsed else None,
          "speed": parsed.speed if parsed else None,
          "totalSizeKb": parsed.totalSizeKb if parsed else None,
          "bitrateKbps": parsed.bitrateKbps if parsed else None,
        },
      }
    }
    set_progress(pct, stage="ffmpeg", message=f"[{step_index + 1}/{step_total}] running", extra=extra)

  try:
    assert proc.stdout is not None
    assert proc.stderr is not None

    # Non-blocking multiplexed read from stdout/stderr.
    for f in (proc.stdout, proc.stderr):
      fd = f.fileno()
      fl = fcntl.fcntl(fd, fcntl.F_GETFL)
      fcntl.fcntl(fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)

    out_buf = ""
    err_buf = ""
    kv_block: dict[str, str] = {}
    kv_raw: list[str] = []

    def handle_line(line: str, which: str) -> None:
      nonlocal kv_block, kv_raw
      if which == "stdout":
        stdout_lines.append(line)
      else:
        stderr_lines.append(line)

      # progress key=value blocks (from -progress)
      if "=" in line:
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip()
        if k:
          kv_block[k] = v
          kv_raw.append(line)
          if k == "progress":
            parsed = _parse_kv_progress_block(kv_block, kv_raw)
            if parsed:
              emit_progress(parsed, parsed.raw)
            kv_block = {}
            kv_raw = []
          return

      parsed = _parse_classic_progress_line(line)
      if parsed:
        emit_progress(parsed, line)

    while True:
      if timeout_s is not None and (time.monotonic() - started) > timeout_s:
        proc.kill()
        raise TimeoutError(f"ffmpeg timeout after {timeout_ms}ms")

      rlist, _, _ = select.select([proc.stdout, proc.stderr], [], [], 0.2)
      for stream in rlist:
        try:
          chunk = stream.read()  # type: ignore[call-arg]
        except Exception:
          chunk = None
        if not chunk:
          continue
        text = str(chunk).replace("\r", "\n")
        if stream is proc.stdout:
          out_buf += text
          while "\n" in out_buf:
            line, out_buf = out_buf.split("\n", 1)
            line = line.strip()
            if line:
              handle_line(line, "stdout")
        else:
          err_buf += text
          while "\n" in err_buf:
            line, err_buf = err_buf.split("\n", 1)
            line = line.strip()
            if line:
              handle_line(line, "stderr")

      code = proc.poll()
      if code is not None:
        # Drain remaining buffered text.
        for which, buf in (("stdout", out_buf), ("stderr", err_buf)):
          for line in buf.split("\n"):
            line = line.strip()
            if line:
              handle_line(line, which)
        break

    rc = proc.wait()
    if rc != 0:
      tail = "\n".join(stderr_lines[-4:])
      raise RuntimeError(f"ffmpeg exit {rc}: {tail}")

    return {
      "stdout": "\n".join(stdout_lines),
      "stderr": "\n".join(stderr_lines),
      "returncode": rc,
      "durationHintSeconds": duration_hint_s,
    }
  finally:
    try:
      if proc.stdout:
        proc.stdout.close()
      if proc.stderr:
        proc.stderr.close()
    except Exception:
      pass


def run_pipeline(
  *,
  label: str,
  commands: list[dict],
  fallback_commands: Optional[list[dict]] = None,
) -> dict:
  """
  Runs a pipeline of ffmpeg commands with an optional fallback pipeline.
  Each command is a dict with keys:
    - args: list[str]
    - cwd?: str
    - env?: dict[str,str]
    - timeoutMs?: int
    - durationHintSeconds?: float
  """
  task_id = current_task_id()
  os.makedirs(os.path.join(os.getcwd(), ".data"), exist_ok=True)

  def attempt(pipeline: list[dict], attempt_name: str) -> dict:
    history: list[dict] = []
    total = len(pipeline)
    ffmpeg_ctx = {"label": label, "attempt": attempt_name, "history": history}
    for i, spec in enumerate(pipeline):
      args = [str(x) for x in (spec.get("args") or [])]
      if not args:
        raise ValueError("ffmpeg command args is empty")

      cwd = spec.get("cwd")
      env = spec.get("env")
      timeout_ms = spec.get("timeoutMs")
      duration_hint_s = spec.get("durationHintSeconds")

      started_at = int(time.time() * 1000)
      history_entry = {
        "index": i,
        "startedAt": started_at,
        "status": "running",
        "command": "ffmpeg " + " ".join(args),
      }
      history.append(history_entry)
      set_progress(
        int((i / max(1, total)) * 100),
        stage="ffmpeg",
        message=f"{label}: {attempt_name} [{i + 1}/{total}]",
        extra={"ffmpeg": {"jobId": task_id, **ffmpeg_ctx}},
      )

      try:
        res = _run_single_ffmpeg_command(
          args=args,
          cwd=str(cwd) if isinstance(cwd, str) and cwd.strip() else None,
          env=env if isinstance(env, dict) else None,
          timeout_ms=int(timeout_ms) if isinstance(timeout_ms, int) else None,
          duration_hint_s=float(duration_hint_s) if isinstance(duration_hint_s, (int, float)) else None,
          step_index=i,
          step_total=total,
          ffmpeg_context=ffmpeg_ctx,
        )
        history_entry["status"] = "success"
        history_entry["finishedAt"] = int(time.time() * 1000)
        history_entry["result"] = {"returncode": res.get("returncode")}
        stdout_tail = "\n".join(str(res.get("stdout") or "").splitlines()[-80:])
        stderr_tail = "\n".join(str(res.get("stderr") or "").splitlines()[-80:])
        if stdout_tail:
          history_entry["stdoutTail"] = stdout_tail
        if stderr_tail:
          history_entry["stderrTail"] = stderr_tail
      except Exception as e:
        history_entry["status"] = "failed"
        history_entry["finishedAt"] = int(time.time() * 1000)
        history_entry["error"] = str(e)
        set_progress(
          int((i / max(1, total)) * 100),
          stage="ffmpeg",
          message=f"{label}: {attempt_name} failed",
          extra={"ffmpeg": {"jobId": task_id, "label": label, "attempt": attempt_name, "history": history, "error": str(e)}},
        )
        raise

    return {"label": label, "attempt": attempt_name, "history": history}

  try:
    primary = attempt(commands, "primary")
    set_progress(100, stage="done", message=f"{label}: done", extra={"ffmpeg": {"jobId": task_id, **primary}})
    return {"ok": True, **primary}
  except Exception as e:
    if fallback_commands:
      try:
        fallback = attempt(fallback_commands, "fallback")
        set_progress(100, stage="done", message=f"{label}: done (fallback)", extra={"ffmpeg": {"jobId": task_id, **fallback}})
        return {"ok": True, **fallback}
      except Exception as fe:
        set_progress(100, stage="error", message=f"{label}: failed", extra={"ffmpeg": {"jobId": task_id, "label": label, "error": str(fe)}})
        raise
    set_progress(100, stage="error", message=f"{label}: failed", extra={"ffmpeg": {"jobId": task_id, "label": label, "error": str(e)}})
    raise
