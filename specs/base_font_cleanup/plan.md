# 性能面板字号适配及文本精简实施计划 (Plan)

## 1. 架构设计 (Architecture)

### 文件清单表格
| 文件路径 | 层级 | 改动性质 | 说明 |
|----------|------|----------|------|
| `src/panel/index.html` | [Frontend] | 修改 | 置换 Tab 4 内部写死的 `font-size`，精简多余的英文括号标识语。 |
| `src/panel/components/RenderDebugger.ts` | [Frontend] | 修改 | 去除组件树内的强编码字号，统一引入 `var(--base-font-size)` 做响应式运算。 |
| `UPDATE_LOG.md` | [Docs] | 修改 | 记录本次界面清洁度和全局一致性的改进。 |

### 架构影响评估
> [!NOTE]
> 本次改动不涉及架构层面的任何状态管理或生命周期变更，纯粹为视图层模板字符串的 CSS 值规范化清洗。

### 关键流程图 (Workflow)
```mermaid
graph LR
   A[根节点 CSS 变量(--base-font-size)] --> B[.tab-nav, .node-tree 等]
   A --> C[RenderDebugger 诊断面板]
   A --> D[Profiler 性能分析面板]
   C -. calc() 相对派生 -.-> C
   D -. calc() 相对派生 -.-> D
```

## 2. 分步实施 (Step-by-Step)

### 阶段 A: 代码修改

- [x] [Frontend] 修改 `src/panel/index.html`：缩减标题处的英语注释并用 `calc()` 替换硬字号。
```html
<!-- 改动前示例 -->
<h4 style="margin: 0 0 10px 0; color: #88c;">性能探测数据 (Tick)</h4>
<span style="font-family: monospace; font-size: 14px; color: #4CAF50;">FPS: {{ globalState.profiler?.tick?.fps }}</span>
<!-- ...资源内存排行 (TOP)... -->
<table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">

<!-- 改动后示例 -->
<h4 style="margin: 0 0 10px 0; color: #88c;">性能探测数据</h4>
<span style="font-family: monospace; font-size: calc(var(--base-font-size, 13px) + 1px); color: #4CAF50;">FPS: {{ globalState.profiler?.tick?.fps }}</span>
<!-- ...资源内存排行... -->
<table style="width: 100%; border-collapse: collapse; font-size: calc(var(--base-font-size, 13px) - 2px); text-align: left;">
```

- [x] [Frontend] 修改 `src/panel/components/RenderDebugger.ts`：将相关的离散独立字号全部转换为 `var` 取值。
```typescript
// 改动前示例
<div style="font-size: 12px; color: #aaa;">
// ...
<span style="font-size: 13px; font-weight: bold;" :style="{ color: isCapturing ? '#4caf50' : '#ccc' }">
// ...
<div style="font-size: 10px; color: #aaa; background: rgba(0,0,0,0.5); padding: 2px 4px; border-radius: 3px;">Idx: {{ dc.indicesCount }}</div>

// 改动后示例
<div style="font-size: calc(var(--base-font-size, 13px) - 1px); color: #aaa;">
// ...
<span style="font-size: var(--base-font-size, 13px); font-weight: bold;" :style="{ color: isCapturing ? '#4caf50' : '#ccc' }">
// ...
<div style="font-size: calc(var(--base-font-size, 13px) - 3px); color: #aaa; background: rgba(0,0,0,0.5); padding: 2px 4px; border-radius: 3px;">Idx: {{ dc.indicesCount }}</div>
```

### 阶段 B: 编译验证

- [x] [Build] 在项目根目录执行 `npm run build` 命令，验证 Typescript 按预期打包。

### 阶段 C: 文档更新

- [x] [Docs] 更新 `UPDATE_LOG.md` 以记录修改详情。
```markdown
- **性能及诊断面板排版优化**
  - 精简除去了面板标题中的冗余中英混排注释 (如 `(Tick)`，`(TOP)`)。
  - 将所有深度嵌套视图层遗留的固定 px 字号全部无缝接管至全局 `--base-font-size` 系统，实现排版的极致一致性。
```
