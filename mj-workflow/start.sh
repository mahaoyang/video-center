#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DEFAULT_PORT=3000

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
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
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
Usage: ./start.sh [--port <port>] [--no-kill]

Options:
  --port <port>   Set server port (default: 3000 or PORT from .env.local)
  --no-kill       Do not stop existing listeners; pick a free port instead
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
    --no-kill)
      no_kill=1
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

if [[ "$no_kill" -eq 0 ]]; then
  kill_port_listeners "$port" || true
fi

if is_port_in_use "$port"; then
  new_port="$(pick_free_port "$port" 50)"
  echo "[mj-workflow] Port $port still in use, switching to $new_port"
  port="$new_port"
fi

export PORT="$port"
exec bun --hot src/index.ts
