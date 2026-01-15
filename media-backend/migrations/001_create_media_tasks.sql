CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media_tasks (
  id uuid PRIMARY KEY,
  kind text NOT NULL,
  label text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  progress int NOT NULL DEFAULT 0,
  stage text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error text,
  seq bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  locked_at timestamptz,
  locked_by text
);

CREATE INDEX IF NOT EXISTS media_tasks_status_idx ON media_tasks(status, created_at);
CREATE INDEX IF NOT EXISTS media_tasks_updated_idx ON media_tasks(updated_at);
