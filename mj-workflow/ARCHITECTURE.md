# mj-workflow Architecture (规范化分层)

目标：把“存储 → 后端 → UI数据对接层 → UI组件数据层 → 无头UI → 纯UI”拆成清晰层级，并用导入边界保证“闭合原子化”和“复合积木禁止交联”。

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

