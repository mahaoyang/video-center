#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${ROOT}/.data/test-media"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing dependency: $1" >&2; exit 1; }; }
need ffmpeg
need ffprobe
need sha256sum

test -f "$DIR/sample-image.png" || { echo "missing: $DIR/sample-image.png" >&2; exit 1; }
test -f "$DIR/sample-audio.wav" || { echo "missing: $DIR/sample-audio.wav" >&2; exit 1; }
test -f "$DIR/sample-video.mp4" || { echo "missing: $DIR/sample-video.mp4" >&2; exit 1; }
test -f "$DIR/sample-text.txt" || { echo "missing: $DIR/sample-text.txt" >&2; exit 1; }
test -f "$DIR/sample-subtitles.srt" || { echo "missing: $DIR/sample-subtitles.srt" >&2; exit 1; }

echo "[ok] files exist"

ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height -of default=nk=1:nw=1 "$DIR/sample-video.mp4" >/dev/null
ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate,channels -of default=nk=1:nw=1 "$DIR/sample-audio.wav" >/dev/null

img_hash="$(ffmpeg -v error -i "$DIR/sample-image.png" -frames:v 1 -f rawvideo -pix_fmt rgba - | sha256sum | awk '{print $1}')"
vid_hash="$(ffmpeg -v error -i "$DIR/sample-video.mp4" -frames:v 1 -f rawvideo -pix_fmt rgb24 - | sha256sum | awk '{print $1}')"
aud_hash="$(ffmpeg -v error -i "$DIR/sample-audio.wav" -f s16le -acodec pcm_s16le -ac 1 -ar 44100 - | sha256sum | awk '{print $1}')"

echo "[hash] image rgba frame0: $img_hash"
echo "[hash] video rgb24 frame0: $vid_hash"
echo "[hash] audio s16le 44100 mono: $aud_hash"

echo "[ok] metadata + hashes computed (use these as golden if you want CI gating)"

