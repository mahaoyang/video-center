# mj-workflow Architecture (规范化分层)

目标：把“后端 → 存储 → UI 数据对接层 → UI 组件数据层 → 无头 UI → 纯 UI”拆成清晰层级，并用导入边界保证“闭合原子化”和“复合积木禁止交联”。

## 核心原则（必须遵守）

### 1) 原子闭合（Atoms Closed）
- `src/public/atoms/*` 只能 import `src/public/atoms/*`。
- 原子必须“小而正交”：单一职责、无业务语义、可复用、可组合。
- 原子不得依赖 `blocks/`、`state/`、`storage/`、`adapters/`，也不得读写 DOM（除非该原子就是 DOM 原子，并且仍保持“无业务决策”）。

### 2) 复合积木树杈依赖（Tree-Shaped Bricks）
- 高层复合积木（blocks/headless）必须形成“树杈结构”的依赖：只允许向下依赖原子/低层，不允许同级互引，也不允许跨级反向引用。
- 禁止“网状依赖”：`blocks/*` 互相 import、跨层互引、同级工具互抄。
- 共享逻辑必须下沉：优先下沉到 `atoms/`（纯工具）或 `headless/`（流程编排），而不是让 `blocks/` 之间共享。

### 3) HTML 只负责结构（No Inline Behavior）
- `src/public/index.html` 只放结构/样式/静态标记，不写业务逻辑。
- 禁止 `onclick="..."` 等内联事件；事件绑定在 `blocks/*` 里完成（通过 `id`/`data-*` 绑定）。
- 禁止依赖 `window.*` 做跨模块“遥控器”；需要全局行为时，做成一个 `block` 初始化器，或做成 `atoms/*` 的可复用工具，再由 `app.ts` 统一装配。

## 分层定义（前端）

### 1) Storage（存储）
- 负责：localStorage / IndexedDB / 本地缓存等持久化读写。
- 禁止：直接操作 DOM；禁止依赖 `blocks/`、`ui/`。
- 目录：`src/public/storage/`

### 2) UI Data Adapter（UI 数据对接层）
- 负责：与后端 API 通信、DTO 归一化（把后端响应变成前端可用形状）。
- 目录：`src/public/adapters/`

### 3) UI Component Data（UI 组件数据层）
- 负责：状态类型、Store、派生状态（纯数据，不做 IO）。
- 目录：`src/public/state/`

### 4) Headless UI（无头 UI）
- 负责：流程编排/业务规则（可复用逻辑）；只通过“回调/返回值”与 UI 层交互。
- 禁止：直接操作 DOM（不允许 `document.getElementById` 等）。
- 目录：`src/public/headless/`

### 5) Pure UI（纯 UI）
- 负责：DOM 渲染与事件绑定、展示交互；不做业务决策。
- 目录：`src/public/blocks/`（当前逐步向“纯 UI”收敛）

### 6) Atoms（原子）
- 负责：小而正交的纯函数/小工具（格式化、ID、通用 polling 等）。
- 规则：只允许依赖 `atoms/` 自身（原子闭合）。
- 目录：`src/public/atoms/`

## “闭合原子化 / 多叉树”规则

### 原子闭合
- `atoms/*` 只能 import `atoms/*`
- 任何共享逻辑都优先下沉到 `atoms/` 或 `headless/`，而不是跨 `blocks/` 共享。

### 高层复合积木禁止交联
- `blocks/*` 之间禁止互相 import（同级连接禁止）。
- `headless/*` 之间允许 import（同层内聚），但不得 import `blocks/*`（跳级反向依赖禁止）。

### 单向依赖（推荐）
- `blocks → headless → (adapters,state,atoms) → atoms`
- `storage` 只能被 `blocks/headless` 调用（禁止反向）。

## 约束检查
- 使用 `bun run check:imports` 扫描 `src/public` 的相对导入，违反规则会直接失败。
- 当前导入边界（由 `scripts/check-imports.ts` 强制）：
  - `atoms` 只能 import `atoms`
  - `state/adapters/storage` 不能 import `blocks/app/headless`
  - `headless` 不能 import `blocks/app`（且不能 import “other”）
  - `blocks` 不能 import `blocks/app/other`（允许 import `headless`、`atoms`、`state`、`adapters`、`storage`）

---

## 运行时结构（后端）

### 入口与静态资源
- 入口：`src/index.ts`
  - dist 运行时会把 `cwd` 切到 `dist`，确保相对路径一致（`publicDir`、`.data`）。
  - 静态资源：`dist/public/*`（dev 时为 `src/public/*`）。
  - 本地上传目录：`<project>/.data/uploads`，通过 `GET /uploads/<key>` 直接访问。

### API 路由
- 路由汇总：`src/api/router.ts`
- 典型依赖：
  - MJ：`src/lib/mj-api.ts`
  - 聚合模型/识图：`src/lib/yunwu-chat.ts`、`src/lib/gemini-vision.ts`
  - 图床/转存：`src/lib/imageproxy.ts`
  - 视频：`src/lib/video-api.ts`、`src/lib/gemini-video.ts`
  - 媒体后端：`media-backend`（HTTP 代理 + 任务轮询）

### 本地 uploads 生命周期（关键）
- `POST /api/upload`：上传到本地 `uploads`（返回 `localKey/localUrl`）
- `POST /api/upload/promote`：把本地文件转存到图床（返回 `cdnUrl`）
- `POST /api/upload/delete`：删除本地文件（仅影响 `.data/uploads`）
- `POST /api/upload/cleanup`：清理“无主文件”
  - 入参：`keepLocalKeys[]`（前端根据当前本地状态/历史计算出的引用集合）
  - 出参：`scanned/deleted/deletedKeys`
  - 默认安全策略：若未传 `minAgeSeconds`，默认保留最近 24h 文件，避免误删“刚生成/刚上传但状态尚未落盘”的文件。

---

## 前端：数据与 UI 分层（落地实现）

### 状态模型（单一事实来源）
- `src/public/state/workflow.ts`
  - `WorkflowState` 是 UI 的单一事实来源（Store 中持有）。
  - “删除”语义分两类：
    - **从对话界面移出**（UI-only）：写入 `desktopHiddenStreamMessageIds` / `desktopHiddenPlannerMessageIds`
    - **删除历史记录**（真实删除本地历史）：从 `streamMessages` 移除（Vault/Timeline 中操作）

### 持久化（localStorage）
- `src/public/storage/persistence.ts`
  - 启动时 `loadPersistedState()` 恢复 `streamMessages/referenceImages/history/...`。
  - `startPersistence()` 对 Store 订阅，增量写入 localStorage。
  - UI-only 的隐藏列表同样会持久化（避免刷新后“隐藏失效”）。

### UI 与“删除”行为（符合你的需求）

#### 1) 对话框右上角“删除”（只移出，不删历史/本地数据）
- Stream 主对话卡片：`src/public/blocks/stream-history.ts`
  - 点击删除：把 messageId 加入 `desktopHiddenStreamMessageIds`，UI 即刻移除该卡片。
- Planner Chat：`src/public/blocks/planner-chat.ts`
  - 点击删除：把 messageId 加入 `desktopHiddenPlannerMessageIds`，UI 即刻移除该气泡。

#### 2) 历史记录删除（触发真正清理）
- Vault/Timeline：`src/public/blocks/vault-timeline.ts`
  - 删除单条 / 清空全部：从 `streamMessages` 真正移除，并触发一次 uploads GC（见下节）。

### 无主文件清理（GC）
- 计算引用集合（keep list）：`src/public/headless/uploads-gc.ts`
  - 从 `WorkflowState` 派生出所有可能引用到 `/uploads/<key>` 的 URL / `localKey`：
    - `referenceImages`、`history` 快照、`streamMessages` 输出、`mediaAssets` 等
- 触发清理：
  - 启动后：`src/public/app.ts` 会延迟触发一次（默认 24h 宽限）
  - 删除历史后：`src/public/blocks/vault-timeline.ts` 立即触发一次（`minAgeSeconds=0`，尽快回收）

---

## 实践建议（避免踩坑）

- “对话界面删除”必须是 UI-only：不要改 `streamMessages`，否则会影响历史与可追溯性。
- “历史删除”才做数据清理：以 `streamMessages` 为准，历史里不再引用的本地文件才有资格被清掉。
- uploads 清理一定要有“宽限期”：
  - 前端状态落盘（localStorage）与文件写入（uploads）存在时序差，默认 24h 能显著降低误删概率。
