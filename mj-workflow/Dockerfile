FROM oven/bun:1.3.5 AS base
WORKDIR /app

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
