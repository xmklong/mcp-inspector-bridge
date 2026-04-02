# 修复横屏模式下游戏预览画面滚动条复发 — 实施计划

## 第一部分：架构设计 (Architecture)

### 涉及文件一览

| 文件路径 | 层级 | 改动性质 |
|---------|------|---------|
| `src/preload.ts` | Webview 预加载层（早期注入） | 修改：扩充 CSS 注入规则 |
| `src/panel/composables/useGameView.ts` | 面板 Composable 层（运行时注入） | 修改：扩充 `insertCSS` 规则 |
| `UPDATE_LOG.md` | 项目文档 | 修改：追加缺陷修复记录 |

### 数据模型 / 架构影响

**无数据模型变更**。本次修复仅涉及 CSS 样式注入层的规则扩充，不改动任何 TypeScript 逻辑、Vue 响应式状态、IPC 通信或 DOM 结构。

修复采用**双层时间夹击**策略：

```
┌─────────────────────────────────────────────────┐
│  Webview 生命周期                                 │
│                                                   │
│  ① DOMContentLoaded (preload.ts)                  │
│     └─ 注入 CSS：隐藏工具栏 + 全容器溢出锁定          │
│                                                   │
│  ② Cocos boot.js 初始化引擎                        │
│     └─ 可能动态设置 canvas/wrapper 尺寸              │
│                                                   │
│  ③ dom-ready (useGameView.ts → insertCSS)          │
│     └─ 二次注入 CSS：覆盖引擎设置，最终兜底            │
└─────────────────────────────────────────────────┘
```

---

## 第二部分：分步实施 (Step-by-Step)

### 阶段 A：代码修改

- [x] **步骤 1** `[Backend]` 修改 `src/preload.ts`：扩充 DOMContentLoaded CSS 注入
  - 在现有的 `style.innerHTML` 模板字符串中追加以下 CSS 规则：
    - `.content, .contentWrap, .wrapper, #GameDiv` 添加 `width: 100% !important; height: 100% !important; max-width: 100vw !important; max-height: 100vh !important; overflow: hidden !important; margin: 0 !important; padding: 0 !important; box-sizing: border-box !important;`
    - `#GameCanvas` 添加 `max-width: 100% !important; max-height: 100% !important;`
    - `*::-webkit-scrollbar` 添加全局滚动条隐藏规则
  - 保持原有 `.toolbar` 和 `.content { top: 0 }` 规则不变

- [x] **步骤 2** `[Frontend]` 修改 `src/panel/composables/useGameView.ts`：扩充 `insertCSS` 规则
  - 替换 L432 行现有的 `insertCSS` 调用，将 CSS 字符串从单行扩展为包含完整约束的多行格式：
    - 选择器列表扩充为 `html, body, .content, .contentWrap, .wrapper, #GameDiv`
    - 增加 `width: 100% !important; height: 100% !important; max-width: 100vw !important; max-height: 100vh !important; box-sizing: border-box !important;`
    - `#GameCanvas` 增加 `max-width`/`max-height` 约束
    - `*::-webkit-scrollbar` 使用通配符全量覆盖
  - 保持 `__pIns.catch` 错误静默逻辑不变

### 阶段 B：编译验证

- [x] **步骤 3** `[Backend]` 执行 `npm run build` 确保 TypeScript 编译通过且产物正确输出

### 阶段 C：文档更新

- [x] **步骤 4** `[Frontend]` 更新 `UPDATE_LOG.md`
  - 在 `[0.0.8]` 版本的 `### 🐛 缺陷修复` 章节末尾追加本次横屏滚动条修复记录
  - 内容包含：核心痛点（横屏宽高互换导致 canvas 溢出）、修复策略（双层 CSS 夹击 + 全容器约束）
