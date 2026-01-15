# media-backend (FastAPI + Postgres)

用于承接视频/音频合成、图片处理等“重型异步任务”的独立后端：API 负责入队/查询进度，Worker 负责执行任务（可调用 `ffmpeg` / `sharp` / `imagemagick` 等）。

## 结构

- `media_backend/main.py`: FastAPI（入队、查询状态、SSE 进度流）
- `media_backend/queue.py`: Postgres 任务队列封装（SKIP LOCKED claim）
- `media_backend/tasks/*`: 任务实现（当前先提供 demo 占位任务 + ffmpeg 占位任务）
- `worker.py`: Worker 进程入口

## 依赖

- Python 3.10+
- Postgres（任务队列与进度存储，PG-only）
- `ffmpeg`（后续视频/音频合成任务需要；当前 demo 不依赖）

## 本地启动（uv）

```bash
cd media-backend

# 1) 创建虚拟环境
uv venv
source .venv/bin/activate

# 2) 安装依赖
uv pip install -r requirements.txt

# 3) 配置 Postgres 连接（示例）
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/media_backend"

# 4) 启动 API
uvicorn media_backend.main:app --reload --port 9010

# 5) 另开一个终端启动 Worker
python worker.py
```

默认 Postgres 连接：`DATABASE_URL=postgresql://postgres:postgres@localhost:5433/media_backend`

启动时会自动执行 `CREATE TABLE IF NOT EXISTS ...` 初始化任务表（无需手动建表）。

## 用 Docker 起 Postgres（推荐）

仓库根目录提供了 `docker-compose.pg.yml`，一键启动本地 PG：

```bash
docker compose -f docker-compose.pg.yml up -d
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/media_backend"
```

如果你想自定义端口：

```bash
PG_PORT=5433 docker compose -f docker-compose.pg.yml up -d
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/media_backend"
```

## API 约定（当前脚手架）

- `GET /health`
- `POST /api/tasks/demo/sleep` -> 入队 demo 任务（会持续更新 `progress`）
- `POST /api/tasks/ffmpeg/pipeline` -> 入队 ffmpeg 命令流水线（支持兜底 `fallbackCommands`，会持续更新进度）
- `POST /api/tasks/ffmpeg/search` -> 入队 ffmpeg “候选流水线搜索”（按 `score` 从低到高依次尝试，成功即停止；每一步会透出真实 ffmpeg 进度）
- `GET /api/tasks/{task_id}` -> 查询状态/进度/结果
- `GET /api/tasks/{task_id}/events` -> SSE 进度流（前端可选）

返回结构与现有体系对齐：

```json
{ "code": 0, "description": "OK", "result": { ... } }
```

## 测试素材与快速验证

生成轻量测试素材（输出到 `media-backend/.data/test-media`）：

```bash
media-backend/scripts/gen_test_media.sh
media-backend/scripts/verify_test_media.sh
```

验证 “search 会优先选择最少编码路径（encodeCount 更小）”：

```bash
# 需先启动 API + worker
media-backend/scripts/smoke_ffmpeg_search.sh
```
