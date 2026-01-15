from __future__ import annotations

from dataclasses import dataclass
import json
import time
import uuid
from pathlib import Path
from typing import Any, Optional

import psycopg
from psycopg.rows import dict_row

from .settings import Settings


@dataclass(frozen=True)
class QueueContext:
  database_url: str


def create_queue(settings: Settings) -> QueueContext:
  return QueueContext(database_url=settings.database_url)


def _connect(ctx: QueueContext) -> psycopg.Connection:
  return psycopg.connect(ctx.database_url, row_factory=dict_row)


def ensure_schema(ctx: QueueContext) -> None:
  """
  Minimal migrations runner:
  - Uses `schema_migrations` table to track applied versions.
  - Applies `media-backend/migrations/*.sql` in filename order.
  """
  def exec_sql(cur, sql: str) -> None:
    # psycopg (v3) uses prepared statements by default and disallows multiple statements
    # in one execute. Our migration files are plain DDL and may contain multiple statements.
    try:
      cur.execute(sql, prepare=False)  # type: ignore[call-arg]
      return
    except TypeError:
      pass

    for part in sql.split(";"):
      stmt = part.strip()
      if stmt:
        cur.execute(stmt)

  migrations_dir = Path(__file__).resolve().parents[1] / "migrations"
  if not migrations_dir.exists():
    return

  with _connect(ctx) as conn:
    with conn.cursor() as cur:
      cur.execute("SELECT pg_advisory_lock(hashtext('media-backend-schema-migrations'));")
      exec_sql(
        cur,
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        );
        """
      )
      cur.execute("SELECT version FROM schema_migrations;")
      applied = {str(r["version"]) for r in (cur.fetchall() or []) if r and r.get("version")}

      for sql_file in sorted(migrations_dir.glob("*.sql")):
        version = sql_file.stem
        if version in applied:
          continue
        sql = sql_file.read_text(encoding="utf-8")
        if not sql.strip():
          continue
        exec_sql(cur, sql)
        cur.execute("INSERT INTO schema_migrations(version) VALUES (%s) ON CONFLICT DO NOTHING;", (version,))
      conn.commit()
      cur.execute("SELECT pg_advisory_unlock(hashtext('media-backend-schema-migrations'));")


def enqueue(
  ctx: QueueContext,
  *,
  kind: str,
  label: str,
  payload: dict[str, Any],
) -> str:
  task_id = uuid.uuid4()
  now_ms = int(time.time() * 1000)
  meta = {"seq": 0, "updatedAt": now_ms}
  with _connect(ctx) as conn:
    with conn.cursor() as cur:
      cur.execute(
        """
        INSERT INTO media_tasks (id, kind, label, payload, status, progress, stage, message, meta, seq)
        VALUES (%s, %s, %s, %s::jsonb, 'queued', 0, '', '', %s::jsonb, 0)
        """,
        (task_id, str(kind), str(label), json.dumps(payload, ensure_ascii=False), json.dumps(meta, ensure_ascii=False)),
      )
  return str(task_id)


def fetch_task(ctx: QueueContext, task_id: str) -> dict[str, Any]:
  with _connect(ctx) as conn:
    with conn.cursor() as cur:
      cur.execute("SELECT * FROM media_tasks WHERE id = %s", (task_id,))
      row = cur.fetchone()
  if not row:
    raise KeyError(f"task not found: {task_id}")
  return dict(row)


def update_task_progress(
  *,
  conn: psycopg.Connection,
  task_id: str,
  progress: int,
  stage: str,
  message: str,
  extra: Optional[dict[str, Any]] = None,
) -> None:
  p = int(progress)
  if p < 0:
    p = 0
  if p > 100:
    p = 100

  now_ms = int(time.time() * 1000)
  extra_meta = dict(extra or {})
  extra_meta["updatedAt"] = now_ms

  with conn.cursor() as cur:
    cur.execute(
      """
      UPDATE media_tasks
      SET progress = %s,
          stage = %s,
          message = %s,
          meta = COALESCE(meta, '{}'::jsonb) || %s::jsonb,
          seq = seq + 1,
          updated_at = now()
      WHERE id = %s
      """,
      (p, str(stage or ""), str(message or ""), json.dumps(extra_meta, ensure_ascii=False), task_id),
    )
  conn.commit()


def finish_task(
  *,
  conn: psycopg.Connection,
  task_id: str,
  result: Any,
  extra_meta: Optional[dict[str, Any]] = None,
) -> None:
  now_ms = int(time.time() * 1000)
  extra = dict(extra_meta or {})
  extra["updatedAt"] = now_ms
  with conn.cursor() as cur:
    cur.execute(
      """
      UPDATE media_tasks
      SET status = 'finished',
          progress = 100,
          stage = 'done',
          message = COALESCE(message, ''),
          result = %s::jsonb,
          meta = COALESCE(meta, '{}'::jsonb) || %s::jsonb,
          seq = seq + 1,
          updated_at = now(),
          finished_at = now()
      WHERE id = %s
      """,
      (json.dumps(result, ensure_ascii=False), json.dumps(extra, ensure_ascii=False), task_id),
    )
  conn.commit()


def fail_task(
  *,
  conn: psycopg.Connection,
  task_id: str,
  error: str,
  extra_meta: Optional[dict[str, Any]] = None,
) -> None:
  now_ms = int(time.time() * 1000)
  extra = dict(extra_meta or {})
  extra["updatedAt"] = now_ms
  with conn.cursor() as cur:
    cur.execute(
      """
      UPDATE media_tasks
      SET status = 'failed',
          stage = 'error',
          error = %s,
          meta = COALESCE(meta, '{}'::jsonb) || %s::jsonb,
          seq = seq + 1,
          updated_at = now(),
          finished_at = now()
      WHERE id = %s
      """,
      (str(error or "failed"), json.dumps(extra, ensure_ascii=False), task_id),
    )
  conn.commit()


def mark_started(
  *,
  conn: psycopg.Connection,
  task_id: str,
  worker_id: str,
) -> None:
  now_ms = int(time.time() * 1000)
  with conn.cursor() as cur:
    cur.execute(
      """
      UPDATE media_tasks
      SET status = 'started',
          started_at = COALESCE(started_at, now()),
          locked_at = now(),
          locked_by = %s,
          meta = COALESCE(meta, '{}'::jsonb) || %s::jsonb,
          seq = seq + 1,
          updated_at = now()
      WHERE id = %s
      """,
      (str(worker_id), json.dumps({"updatedAt": now_ms}, ensure_ascii=False), task_id),
    )
  conn.commit()


def claim_next_task(
  ctx: QueueContext,
  *,
  worker_id: str,
) -> Optional[dict[str, Any]]:
  with _connect(ctx) as conn:
    with conn.cursor() as cur:
      cur.execute(
        """
        WITH candidate AS (
          SELECT id
          FROM media_tasks
          WHERE status = 'queued'
          ORDER BY created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE media_tasks t
        SET status = 'started',
            started_at = now(),
            locked_at = now(),
            locked_by = %s,
            seq = seq + 1,
            updated_at = now()
        FROM candidate c
        WHERE t.id = c.id
        RETURNING t.*
        """,
        (str(worker_id),),
      )
      row = cur.fetchone()
    conn.commit()
    if not row:
      return None
    return dict(row)
