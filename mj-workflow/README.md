# MJ Workflow

Midjourney 图像生成完整工作流前端页面，使用 Bun + TypeScript 构建。

## 功能特性

完整的 MJ 图像生成工作流：

1. ✅ **上传参考图**（可选）- 支持 JPG/PNG/WebP 格式
2. ✅ **反推提示词** - 从参考图自动生成 Prompt
3. ✅ **提示词编辑** - 修改或直接输入提示词
4. ✅ **生成四宫格** - MJ 生成 4 张候选图
5. ✅ **四宫格切图** - 前端切割预览
6. ✅ **图片扩图** - 选择一张进行高清放大
7. ✅ **下载图片** - 下载最终成品
8. ✅ **Planner Chat（规划器）** - 规划多分镜提示词；输入 `suno/歌词/配乐` 可将多分镜按顺序合成为 1 首歌的 `LYRICS_PROMPT`（元标签歌词/纯音乐）+ `STYLE_PROMPT`（风格提示词，可一键复制）

## Planner Chat（规划器）提示

- 生成 MJ 分镜：描述剧情/镜头，AI 会返回多条分镜；点每条里的 “Use” 可直接填入主输入框。
- 生成 Suno 歌曲：在分镜描述里加上 `suno` / `歌词` / `配乐` / `纯音乐` 等要求，AI 会返回两段：`LYRICS_PROMPT:`（元标签歌词或纯元标签）和 `STYLE_PROMPT:`（风格提示词，可一键复制）。

## 技术栈

- **运行时**: Bun
- **后端**: Bun.serve() + TypeScript
- **前端**: 原生 HTML/CSS/TypeScript
- **样式**: Tailwind CSS（参考 ccr 项目风格）
- **API**: MJ (yunwu.ai) 接口封装

## 快速开始

### 1. 安装依赖

```bash
bun install
```

### 2. 配置环境变量

复制 `mj-workflow/.env.example` 的内容到仓库根目录 `.env.local` 并配置：

```bash
# 示例：复制到根目录（推荐）
cp mj-workflow/.env.example .env.local
```

编辑 `.env.local` 文件：

```env
MJ_API_URL=https://yunwu.ai
YUNWU_MJ_KEY=your_yunwu_mj_key_here
YUNWU_ALL_KEY=your_yunwu_all_key_here
IMAGEPROXY_API_URL=https://imageproxy.zhongzhuan.chat
IMAGEPROXY_TOKEN=your_imageproxy_token_here
PORT=3000
VISION_MODEL=gpt-5.2-chat-latest
```

说明：`YUNWU_ALL_KEY` 用于聚合模型（Claude/GPT 等）；`YUNWU_MJ_KEY` 用于 MJ（/mj/submit/*）。
说明：图床上传走 `IMAGEPROXY_TOKEN`（或 `YUNWU_API_KEY / YUNWU_ALL_KEY` 兜底），后端提供 `POST /api/upload` 供前端换取图片 URL。
说明：MJ 接口不会回退使用 `YUNWU_ALL_KEY`。

### 3. 运行开发服务器

```bash
bun run dev
```

默认服务器将在 `http://localhost:3000` 启动；如端口被占用且未显式设置 `PORT`，会自动切换到下一个可用端口。

也可以使用 `./start.sh`（会优先读取 `.env.local` 的 `PORT`，并在端口占用时自动处理/切换）：

```bash
./start.sh
```

### 4. 构建生产版本

```bash
bun run build
bun run start
```

`build` 会同时构建后端服务（`dist/index.js`）和前端 bundle（`dist/public/assets/app.js`），并拷贝 `src/public/index.html` 到 `dist/public/index.html`。

## 项目结构

```
mj-workflow/
├── src/
│   ├── index.ts              # 后端服务入口
│   ├── api/
│   │   └── router.ts         # API 路由处理
│   ├── server/
│   │   └── static.ts         # 静态资源（含 dev 前端打包）
│   ├── lib/
│   │   ├── mj-api.ts         # MJ API 封装
│   │   └── image-utils.ts    # 图片处理工具
│   └── types/
│       └── index.ts          # TypeScript 类型定义
│   └── public/
│       ├── index.html        # 主页面
│       └── app.ts            # 前端入口（会被打包到 dist/public/assets/app.js）
├── demo-upscale.ts           # 扩图 Demo（独立测试）
├── package.json
├── .env.example
└── README.md
```

## API 接口

### POST /api/describe
反推提示词

**请求**:
```json
{
  "base64": "图片的base64编码（不含前缀）",
  "imageUrl": "或者图片URL"
}
```

**响应**:
```json
{
  "code": 0,
  "description": "成功",
  "result": {
    "prompt": "反推出的提示词"
  }
}
```

### POST /api/imagine
生成图片

**请求**:
```json
{
  "prompt": "提示词文本",
  "notifyHook": "回调URL（可选）",
  "state": "自定义状态（可选）"
}
```

**响应**:
```json
{
  "code": 0,
  "description": "成功",
  "result": {
    "taskId": "任务ID",
    "imageUrl": "四宫格图片URL（任务完成后）"
  }
}
```

### POST /api/upscale
扩图

**请求**:
```json
{
  "taskId": "原任务ID",
  "index": 1  // 选择的图片索引（1-4）
}
```

**响应**:
```json
{
  "code": 0,
  "description": "成功",
  "result": {
    "taskId": "新任务ID",
    "imageUrl": "扩图后的URL（任务完成后）"
  }
}
```

### GET /api/task/:taskId
查询任务状态

**响应**:
```json
{
  "code": 0,
  "description": "成功",
  "result": {
    "status": "SUCCESS",  // PENDING | PROCESSING | SUCCESS | FAILURE
    "imageUrl": "图片URL",
    "progress": 100,
    "failReason": "失败原因（如果失败）"
  }
}
```

### POST /api/vision/describe
识图描述（多模态 Chat Completions）

**请求**:
```json
{
  "imageUrl": "图片URL 或 data:image/...;base64,...",
  "question": "可选，默认：这张图片里有什么?请详细描述。",
  "model": "可选，默认 claude-sonnet-4-5-20250929（可用 VISION_MODEL 覆盖）"
}
```

**响应**:
```json
{
  "code": 0,
  "description": "成功",
  "result": {
    "text": "识图文本",
    "raw": {}
  }
}
```

## 扩图 Demo

项目包含一个独立的扩图 demo（从 Python 迁移到 TypeScript）：

```bash
bun run demo-upscale.ts
```

修改 `demo-upscale.ts` 中的 token 和参数后运行。

## 识图 Demo（Python）

文件：`demo/vision_chat_completions.py`

```bash
python3 demo/vision_chat_completions.py
```

可选传参：`python3 demo/vision_chat_completions.py <imageUrl> "<question>" <model>`

## 环境要求

- Bun >= 1.0.0
- Node.js >= 18 (可选，Bun 优先)

## 开发说明

### 样式参考

页面样式参考 `/home/ha/workspace/ccr` 项目的公共首页：

- 玻璃态效果（backdrop-filter）
- 品牌色：#1f2f22
- 圆角设计（rounded-2xl）
- 柔和阴影
- 响应式布局

### 前端工作流状态管理

前端使用全局 `state` 对象管理工作流状态：

```typescript
interface WorkflowState {
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7;  // 当前步骤
  uploadedImage?: string;            // 上传的图片base64
  prompt?: string;                   // 提示词
  taskId?: string;                   // MJ任务ID
  gridImageUrl?: string;             // 四宫格图片URL
  selectedIndex?: number;            // 选中的图片索引
  upscaledImages?: string[];         // 扩图后的图片
}
```

### 图片切图说明

四宫格切图目前使用 CSS 模拟（`object-position` + `transform: scale`），
如需真实切图可使用 `src/lib/image-utils.ts` 中的 `splitGridImage()` 函数。

## License

MIT

## 作者

Generated with Bun + Claude Code
