from __future__ import annotations

import time

from ..progress import current_task_id, set_progress
from .ffmpeg_pipeline import _run_single_ffmpeg_command


def _infer_command_requires_encode(args: list[str]) -> bool:
  """
  Heuristic: treat a command as "encoding" unless it's an explicit stream copy without filters.
  This is intentionally conservative so we don't accidentally rank an encoding command as copy-only.
  """
  a = [str(x) for x in (args or [])]
  joined = " ".join(a).lower()

  # Filters force re-encode (at least video).
  if "-vf" in a or "-filter_complex" in a or "-lavfi" in a or "-af" in a:
    return True

  # Explicit copy.
  if "-c" in a:
    try:
      i = a.index("-c")
      if i + 1 < len(a) and str(a[i + 1]).lower() == "copy":
        return False
    except Exception:
      pass
  for flag in ("-c:v", "-codec:v", "-vcodec", "-c:a", "-codec:a", "-acodec", "-c:s", "-codec:s", "-scodec"):
    if flag in a:
      try:
        i = a.index(flag)
        if i + 1 < len(a) and str(a[i + 1]).lower() != "copy":
          return True
      except Exception:
        pass

  # If codec not specified, assume it will encode.
  if "-c" not in a and all(f not in a for f in ("-c:v", "-vcodec", "-c:a", "-acodec", "-c:s", "-scodec")):
    return True

  # If we only see copy codecs and no filters, treat as non-encoding.
  if "copy" in joined and "-vf" not in a and "-filter_complex" not in a and "-af" not in a:
    return False

  return True


def _infer_candidate_encode_count(cand: dict) -> int:
  raw = cand.get("encodeCount")
  if isinstance(raw, int) and raw >= 0:
    return raw
  commands = cand.get("commands") or []
  if not isinstance(commands, list):
    return 0
  count = 0
  for cmd in commands:
    args = cmd.get("args") if isinstance(cmd, dict) else None
    if isinstance(args, list) and _infer_command_requires_encode(args):
      count += 1
  return count


def _sort_key(item: tuple[int, dict]) -> tuple[int, float, int]:
  idx, cand = item
  encode_count = _infer_candidate_encode_count(cand)
  score = cand.get("score")
  has_score = 0 if isinstance(score, (int, float)) else 1
  score_val = float(score) if isinstance(score, (int, float)) else float("inf")
  return (encode_count, has_score, score_val, idx)


def _run_attempt(
  *,
  label: str,
  attempt_name: str,
  pipeline: list[dict],
  ffmpeg_ctx: dict,
) -> dict:
  history: list[dict] = []
  total = len(pipeline)
  ffmpeg_ctx["attempt"] = attempt_name
  ffmpeg_ctx["history"] = history

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
      extra={"ffmpeg": {**ffmpeg_ctx}},
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
        extra={"ffmpeg": {**ffmpeg_ctx, "error": str(e)}},
      )
      raise

  return {"label": label, "attempt": attempt_name, "history": history}


def run_search(
  *,
  label: str,
  candidates: list[dict],
) -> dict:
  """
  Best-first sequential search: try candidates ordered by score (lower first) until one succeeds.
  Each candidate is a dict with keys:
    - label?: str
    - score?: float
    - commands: list[dict] (ffmpeg command specs)
    - fallbackCommands?: list[dict]
  """
  task_id = current_task_id()

  if not candidates:
    raise ValueError("candidates is empty")

  attempts: list[dict] = []
  ordered = sorted(list(enumerate(candidates)), key=_sort_key)
  total_candidates = len(ordered)

  for order_index, (orig_index, cand) in enumerate(ordered):
    cand_label = str(cand.get("label") or f"candidate-{orig_index}")
    score = cand.get("score")
    encode_count = _infer_candidate_encode_count(cand)
    commands = cand.get("commands") or []
    fallback = cand.get("fallbackCommands") or None
    if not isinstance(commands, list) or not commands:
      continue

    ffmpeg_ctx = {
      "jobId": task_id,
      "label": label,
      "search": {
        "candidateIndex": order_index,
        "candidateTotal": total_candidates,
        "candidateLabel": cand_label,
        "candidateOrigIndex": orig_index,
        "candidateScore": score,
        "candidateEncodeCount": encode_count,
      },
      "searchAttempts": attempts,
    }

    set_progress(
      int((order_index / max(1, total_candidates)) * 100),
      stage="ffmpeg-search",
      message=f"{label}: try {cand_label} [{order_index + 1}/{total_candidates}]",
      extra={"ffmpeg": {**ffmpeg_ctx}},
    )

    started = time.monotonic()
    try:
      primary = _run_attempt(label=label, attempt_name="primary", pipeline=commands, ffmpeg_ctx=ffmpeg_ctx)
      result = primary
      chosen_attempt = "primary"
      attempts.append(
        {
          "label": cand_label,
          "score": score,
          "origIndex": orig_index,
          "orderIndex": order_index,
          "status": "success",
          "durationMs": int((time.monotonic() - started) * 1000),
        }
      )
      set_progress(
        100,
        stage="done",
        message=f"{label}: done ({cand_label})",
        extra={
          "ffmpeg": {
            **ffmpeg_ctx,
            "searchAttempts": attempts,
            "chosen": {"label": cand_label, "score": score, "encodeCount": encode_count, "attempt": chosen_attempt, "result": result},
          }
        },
      )
      return {"ok": True, "label": label, "chosen": {"label": cand_label, "score": score, "encodeCount": encode_count}, "result": result, "attempts": attempts}
    except Exception as e:
      # Try candidate-level fallback.
      if isinstance(fallback, list) and fallback:
        try:
          fb = _run_attempt(label=label, attempt_name="fallback", pipeline=fallback, ffmpeg_ctx=ffmpeg_ctx)
          attempts.append(
            {
              "label": cand_label,
              "score": score,
              "origIndex": orig_index,
              "orderIndex": order_index,
              "status": "success",
              "usedFallback": True,
              "durationMs": int((time.monotonic() - started) * 1000),
            }
          )
          set_progress(
            100,
            stage="done",
            message=f"{label}: done ({cand_label}, fallback)",
            extra={
              "ffmpeg": {
                **ffmpeg_ctx,
                "searchAttempts": attempts,
                "chosen": {"label": cand_label, "score": score, "encodeCount": encode_count, "attempt": "fallback", "result": fb},
              }
            },
          )
          return {"ok": True, "label": label, "chosen": {"label": cand_label, "score": score, "encodeCount": encode_count}, "result": fb, "attempts": attempts}
        except Exception as fe:
          attempts.append(
            {
              "label": cand_label,
              "encodeCount": encode_count,
              "score": score,
              "origIndex": orig_index,
              "orderIndex": order_index,
              "status": "failed",
              "error": str(fe),
              "durationMs": int((time.monotonic() - started) * 1000),
            }
          )
          set_progress(
            int(((order_index + 1) / max(1, total_candidates)) * 100),
            stage="ffmpeg-search",
            message=f"{label}: candidate failed ({cand_label})",
            extra={"ffmpeg": {**ffmpeg_ctx, "searchAttempts": attempts, "error": str(fe)}},
          )
          continue

      attempts.append(
        {
          "label": cand_label,
          "encodeCount": encode_count,
          "score": score,
          "origIndex": orig_index,
          "orderIndex": order_index,
          "status": "failed",
          "error": str(e),
          "durationMs": int((time.monotonic() - started) * 1000),
        }
      )
      set_progress(
        int(((order_index + 1) / max(1, total_candidates)) * 100),
        stage="ffmpeg-search",
        message=f"{label}: candidate failed ({cand_label})",
        extra={"ffmpeg": {**ffmpeg_ctx, "searchAttempts": attempts, "error": str(e)}},
      )

  set_progress(100, stage="error", message=f"{label}: all candidates failed", extra={"ffmpeg": {"jobId": job_id, "label": label, "attempts": attempts}})
  raise RuntimeError("all candidates failed")
