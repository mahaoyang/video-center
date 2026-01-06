# mj-workflow Architecture (规范化分层)

目标：把“存储 → 后端 → UI数据对接层 → UI组件数据层 → 无头UI → 纯UI”拆成清晰层级，并用导入边界保证“闭合原子化”和“复合积木禁止交联”。

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
