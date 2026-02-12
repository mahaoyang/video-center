FROM oven/bun:1.3.5 AS base
WORKDIR /app

# ffmpeg/ffprobe are required for audio/video postprocess (loudnorm, transcode).
# python3 is required for /api/ai/skill/py-add test skill execution.
# Use retries to tolerate transient mirror/proxy 5xx errors.
RUN set -eux; \
  for i in 1 2 3; do \
    apt-get -o Acquire::Retries=5 update; \
    if apt-get -o Acquire::Retries=5 install -y --no-install-recommends ffmpeg python3; then \
      rm -rf /var/lib/apt/lists/*; \
      break; \
    fi; \
    echo "[mj-workflow] apt install ffmpeg failed (attempt ${i}), retrying..."; \
    sleep 2; \
  done; \
  command -v ffmpeg; \
  command -v ffprobe; \
  command -v python3

# Install deps first for better caching
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# App source
COPY . .

RUN bun run build

ENV PORT=3015
ENV BIND_HOST=0.0.0.0
EXPOSE 3015

CMD ["bun", "run", "start"]
