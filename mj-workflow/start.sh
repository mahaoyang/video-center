#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DEFAULT_PORT=3000
DEFAULT_MEDIA_PORT=9010
DEFAULT_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/media_backend"
DEFAULT_PG_COMPOSE_FILE="docker-compose.pg.yml"

strip_quotes() {
  local value="${1:-}"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  printf '%s' "$value"
}

read_port_from_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  local line
  line="$(grep -E '^[[:space:]]*PORT[[:space:]]*=' "$file" | head -n 1 || true)"
  [[ -n "$line" ]] || return 0
  strip_quotes "${line#*=}"
}

is_port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -ltnH "sport = :$port" 2>/dev/null | head -n 1 | grep -q .
    return $?
  fi
  # Last resort: try to connect (works for localhost only).
  (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1
}

is_valid_port() {
  local port="${1:-}"
  [[ "$port" =~ ^[0-9]+$ ]] || return 1
  ((10#$port >= 1 && 10#$port <= 65535))
}

kill_port_listeners() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  [[ -n "$pids" ]] || return 0

  echo "[mj-workflow] Port $port in use (pid: $pids), stopping…"
  kill $pids 2>/dev/null || true
  sleep 0.2

  if is_port_in_use "$port"; then
    kill -9 $pids 2>/dev/null || true
    sleep 0.2
  fi
}

pick_free_port() {
  local start="$1"
  local max_tries="${2:-50}"
  local port
  for ((i = 0; i <= max_tries; i++)); do
    port=$((start + i))
    if ! is_port_in_use "$port"; then
      printf '%s' "$port"
      return 0
    fi
  done
  return 1
}

usage() {
  cat <<'EOF'
Usage: ./start.sh [--port <port>] [--media-port <port>] [--db-url <url>] [--no-kill] [--no-py] [--no-pg] [--py-reload]

Options:
  --port <port>        MJ Workflow server port (default: 3000 or PORT from .env.local)
  --media-port <port>  media-backend (FastAPI) port (default: 9010)
  --db-url <url>       media-backend DATABASE_URL (default: postgresql://postgres:postgres@localhost:5433/media_backend)
  --no-kill            Do not stop existing listeners; pick a free port instead (applies to both)
  --no-py              Do not start media-backend (API + worker)
  --no-pg              Do not auto-start Postgres via docker compose
  --py-reload          Start media-backend with uvicorn --reload
EOF
}

port="${PORT:-}"
if [[ -z "${port:-}" ]]; then
  port="$(read_port_from_env_file "../.env.local" || true)"
fi
if [[ -z "${port:-}" ]]; then
  port="$(read_port_from_env_file "./.env.local" || true)"
fi
port="${port:-$DEFAULT_PORT}"

media_port="${MEDIA_PORT:-$DEFAULT_MEDIA_PORT}"
db_url="${DATABASE_URL:-$DEFAULT_DATABASE_URL}"
py_enabled=1
pg_enabled=1
py_reload=0
no_kill=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      if [[ $# -lt 2 ]]; then
        echo "--port requires a value" >&2
        usage >&2
        exit 2
      fi
      port="$2"
      shift 2
      ;;
    --media-port)
      if [[ $# -lt 2 ]]; then
        echo "--media-port requires a value" >&2
        usage >&2
        exit 2
      fi
      media_port="$2"
      shift 2
      ;;
    --db-url)
      if [[ $# -lt 2 ]]; then
        echo "--db-url requires a value" >&2
        usage >&2
        exit 2
      fi
      db_url="$2"
      shift 2
      ;;
    --no-kill)
      no_kill=1
      shift
      ;;
    --no-py)
      py_enabled=0
      shift
      ;;
    --no-pg)
      pg_enabled=0
      shift
      ;;
    --py-reload)
      py_reload=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! is_valid_port "$port"; then
  echo "[mj-workflow] Invalid PORT '$port', falling back to $DEFAULT_PORT" >&2
  port="$DEFAULT_PORT"
fi

if ! is_valid_port "$media_port"; then
  echo "[media-backend] Invalid MEDIA_PORT '$media_port', falling back to $DEFAULT_MEDIA_PORT" >&2
  media_port="$DEFAULT_MEDIA_PORT"
fi

if [[ "$no_kill" -eq 0 ]]; then
  kill_port_listeners "$port" || true
  if [[ "$py_enabled" -eq 1 ]]; then
    kill_port_listeners "$media_port" || true
  fi
fi

if is_port_in_use "$port"; then
  new_port="$(pick_free_port "$port" 50)"
  echo "[mj-workflow] Port $port still in use, switching to $new_port"
  port="$new_port"
fi

export PORT="$port"

if [[ "$py_enabled" -eq 1 ]]; then
  if is_port_in_use "$media_port"; then
    new_media_port="$(pick_free_port "$media_port" 50)"
    echo "[media-backend] Port $media_port still in use, switching to $new_media_port"
    media_port="$new_media_port"
  fi
  export MEDIA_PORT="$media_port"
  export PY_MEDIA_BACKEND_URL="${PY_MEDIA_BACKEND_URL:-http://localhost:${media_port}}"
  export DATABASE_URL="${DATABASE_URL:-$db_url}"
fi

REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MEDIA_DIR="$REPO_ROOT/media-backend"

api_pid=""
worker_pid=""
mj_pid=""

cleanup() {
  local code=$?
  set +e
  if [[ -n "${mj_pid:-}" ]]; then kill "$mj_pid" 2>/dev/null || true; fi
  if [[ -n "${api_pid:-}" ]]; then kill "$api_pid" 2>/dev/null || true; fi
  if [[ -n "${worker_pid:-}" ]]; then kill "$worker_pid" 2>/dev/null || true; fi
  wait 2>/dev/null || true
  exit "$code"
}
trap cleanup INT TERM EXIT

docker_compose_cmd() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "docker compose"
    return 0
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
    return 0
  fi
  return 1
}

parse_database_url() {
  # prints "host port db" to stdout
  python3 - <<'PY'
import os, sys
from urllib.parse import urlparse

u = os.environ.get("DATABASE_URL", "").strip()
if not u:
  sys.exit(2)
p = urlparse(u)
host = p.hostname or ""
port = p.port or 5432
db = (p.path or "").lstrip("/")
print(host, port, db)
PY
}

pg_can_connect() {
  # returns 0 if we can connect to DATABASE_URL and run a trivial query.
  local py="python3"
  if [[ -x "${MEDIA_DIR:-}/.venv/bin/python" ]]; then
    py="${MEDIA_DIR}/.venv/bin/python"
  fi
  "$py" - <<'PY'
import os, sys, time

url = os.environ.get("DATABASE_URL", "").strip()
if not url:
  sys.exit(2)

try:
  import psycopg
except Exception as e:
  print(f"psycopg missing: {e}", file=sys.stderr)
  sys.exit(3)

try:
  with psycopg.connect(url, connect_timeout=2) as conn:
    with conn.cursor() as cur:
      cur.execute("select 1;")
      cur.fetchone()
  sys.exit(0)
except Exception as e:
  print(str(e), file=sys.stderr)
  sys.exit(1)
PY
}

ensure_pg_running() {
  if [[ "$pg_enabled" -ne 1 ]]; then
    return 0
  fi
  if [[ -z "${DATABASE_URL:-}" ]]; then
    return 0
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "[media-backend] python3 not found; cannot validate DATABASE_URL/pg." >&2
    return 1
  fi

  local host port db
  read -r host port db < <(parse_database_url || true)
  host="${host:-}"
  port="${port:-}"
  db="${db:-}"

  # Only auto-start for localhost connections; if you point DATABASE_URL elsewhere, we won't touch it.
  if [[ "$host" != "localhost" && "$host" != "127.0.0.1" ]]; then
    return 0
  fi
  if ! is_valid_port "$port"; then
    echo "[media-backend] DATABASE_URL port invalid: $port" >&2
    return 1
  fi
  pg_can_connect >/dev/null 2>&1
  local can_rc=$?
  if [[ "$can_rc" -eq 0 ]]; then
    echo "[media-backend] Postgres ready (skip docker compose)"
    return 0
  fi
  if [[ "$can_rc" -eq 3 ]]; then
    # psycopg not installed in the selected python; fall back to socket check.
    if is_port_in_use "$port"; then
      echo "[media-backend] Postgres port open (skip docker compose)"
      return 0
    fi
  fi

  local compose
  if ! compose="$(docker_compose_cmd)"; then
    echo "[media-backend] Postgres not listening on :$port and docker compose not found; start PG manually or pass --no-pg." >&2
    return 1
  fi

  local file="$REPO_ROOT/$DEFAULT_PG_COMPOSE_FILE"
  if [[ ! -f "$file" ]]; then
    echo "[media-backend] compose file not found: $file" >&2
    return 1
  fi

  echo "[media-backend] starting Postgres via docker compose ($file) on host port :$port"
  PG_PORT="$port" $compose -f "$file" up -d

  # Wait for DB to accept connections.
  for i in {1..60}; do
    pg_can_connect >/dev/null 2>&1
    local rc=$?
    if [[ "$rc" -eq 0 ]]; then
      return 0
    fi
    if [[ "$rc" -eq 3 ]]; then
      if is_port_in_use "$port"; then
        return 0
      fi
    fi
    sleep 0.5
  done
  echo "[media-backend] Postgres still not accepting connections after waiting; check docker logs." >&2
  return 1
}

start_media_backend() {
  if [[ "$py_enabled" -ne 1 ]]; then
    return 0
  fi
  if [[ ! -d "$MEDIA_DIR" ]]; then
    echo "[media-backend] directory not found: $MEDIA_DIR" >&2
    return 1
  fi
  if ! command -v uv >/dev/null 2>&1; then
    echo "[media-backend] uv not found. Install uv, or run with --no-py." >&2
    return 1
  fi

  if [[ ! -x "$MEDIA_DIR/.venv/bin/python" ]]; then
    echo "[media-backend] creating venv + installing deps (first run)"
    (cd "$MEDIA_DIR" && uv venv)
  fi
  echo "[media-backend] ensuring python deps"
  (cd "$MEDIA_DIR" && uv pip install -r requirements.txt)

  local uvicorn_args=(media_backend.main:app --host 0.0.0.0 --port "$media_port")
  if [[ "$py_reload" -eq 1 ]]; then
    uvicorn_args+=(--reload)
  fi

  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "[media-backend] DATABASE_URL is empty; set it or pass --db-url" >&2
    return 1
  fi
  ensure_pg_running
  echo "[media-backend] api: http://localhost:${media_port}  (DATABASE_URL configured)"
  (cd "$MEDIA_DIR" && ./.venv/bin/uvicorn "${uvicorn_args[@]}") &
  api_pid="$!"

  echo "[media-backend] worker starting"
  (cd "$MEDIA_DIR" && ./.venv/bin/python worker.py) &
  worker_pid="$!"
}

start_mj_workflow() {
  echo "[mj-workflow] web: http://localhost:${port}"
  bun --hot src/index.ts &
  mj_pid="$!"
}

start_media_backend
start_mj_workflow

echo "[start.sh] running (Ctrl+C to stop all)"
wait -n "$mj_pid" ${api_pid:+$api_pid} ${worker_pid:+$worker_pid}
