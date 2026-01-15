#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT}/.data/test-media"
mkdir -p "$OUT_DIR"

command -v ffmpeg >/dev/null 2>&1 || { echo "missing dependency: ffmpeg" >&2; exit 1; }
command -v ffprobe >/dev/null 2>&1 || { echo "missing dependency: ffprobe" >&2; exit 1; }

ffmpeg -y -v error -f lavfi -i color=c=#4da3ff:s=128x128:d=0.1 -frames:v 1 "$OUT_DIR/sample-image.png"
ffmpeg -y -v error -f lavfi -i sine=frequency=440:duration=2 -ac 1 -ar 44100 -c:a pcm_s16le "$OUT_DIR/sample-audio.wav"
ffmpeg -y -v error \
  -f lavfi -i testsrc=size=640x360:rate=25 \
  -f lavfi -i sine=frequency=1000:duration=2 \
  -t 2 -shortest \
  -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 30 \
  -c:a aac -b:a 128k \
  "$OUT_DIR/sample-video.mp4"

cat >"$OUT_DIR/sample-text.txt" <<'TXT'
media-backend smoke text sample (utf-8).
Hello 123 / 中文混排。
TXT

cat >"$OUT_DIR/sample-subtitles.srt" <<'SRT'
1
00:00:00,000 --> 00:00:01,000
Hello subtitle.

2
00:00:01,000 --> 00:00:02,000
第二行字幕。
SRT

echo "generated test media at: $OUT_DIR"

