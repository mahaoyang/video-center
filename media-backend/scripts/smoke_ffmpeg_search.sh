#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${ROOT}/.data/test-media"
BASE_URL="${PY_MEDIA_BACKEND_URL:-http://localhost:9010}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing dependency: $1" >&2; exit 1; }; }
need curl
need python3
need ffmpeg

"$ROOT/scripts/gen_test_media.sh" >/dev/null

OUT_COPY="$DIR/out-copy.mp4"
OUT_XCODE="$DIR/out-xcode.mp4"
rm -f "$OUT_COPY" "$OUT_XCODE"

payload="$(python3 - <<PY
import json
print(json.dumps({
  "label": "smoke-search-min-encode",
  "candidates": [
    {
      "label": "copy",
      "encodeCount": 0,
      "commands": [
        {"cwd": "$DIR", "args": ["-y", "-i", "sample-video.mp4", "-c", "copy", "out-copy.mp4"]}
      ]
    },
    {
      "label": "xcode",
      "encodeCount": 1,
      "commands": [
        {"cwd": "$DIR", "args": ["-y", "-i", "sample-video.mp4", "-vf", "scale=320:180:flags=neighbor", "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-c:a", "aac", "-b:a", "128k", "out-xcode.mp4"]}
      ]
    }
  ]
}, ensure_ascii=False))
PY
)"

resp="$(curl -sS -X POST "$BASE_URL/api/tasks/ffmpeg/search" -H 'Content-Type: application/json' -d "$payload")"
task_id="$(python3 - <<PY
import json,sys
j=json.loads(sys.stdin.read())
print(j["result"]["id"])
PY
<<<"$resp")"

echo "enqueued: $task_id"

status="$(python3 - <<'PY'
import json, os, sys, time, urllib.request

base = os.environ.get("PY_MEDIA_BACKEND_URL", "http://localhost:9010").rstrip("/")
task = sys.argv[1]

def get():
  with urllib.request.urlopen(f"{base}/api/tasks/{task}") as r:
    return json.loads(r.read().decode("utf-8"))["result"]

while True:
  s = get()
  st = str(s.get("status",""))
  meta = s.get("meta") or {}
  ff = meta.get("ffmpeg") or {}
  chosen = (s.get("result") or {}).get("chosen")
  if st in ("finished","failed"):
    print(json.dumps({"status": st, "error": s.get("error"), "chosen": chosen, "ffmpeg": ff}, ensure_ascii=False))
    raise SystemExit(0 if st=="finished" else 1)
  time.sleep(0.5)
PY
"$task_id")"

echo "$status"

python3 - <<PY
import json, sys
j=json.loads(sys.stdin.read())
chosen=j.get("chosen") or {}
if chosen.get("label") != "copy":
  raise SystemExit(f"expected chosen=copy, got {chosen}")
print("chosen OK:", chosen)
PY
<<<"$status"

test -f "$OUT_COPY" || { echo "missing output: $OUT_COPY" >&2; exit 1; }
echo "output OK: $OUT_COPY"

