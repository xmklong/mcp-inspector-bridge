# 性能面板字号适配及文本精简 (Spec)

## 1. 背景
用户在体验 `Base Font Size` 功能后，发现在“性能分析(Tab 4)”与“渲染诊断(Tab 5)”面板内部相关的字号写死（如 `14px`，`12px`），未能跟随基础字号系统缩放。
同时，性能面板的标题伴有英文括号解释（如 `性能探测数据 (Tick)`），使用户感觉多余，希望将其去掉，以使中文面板更紧凑。

## 2. 视觉需求 (Visual Requirements)

**改动前 (带有字号不可变的英文后缀与硬编码样式)：**
```text
[性能探测数据 (Tick)] (硬编码 14px)
FPS: 60    DrawCall: 120

[资源内存排行 (TOP)] (硬编码 12px)
| 资源名称... | ...
```

**改动后 (跟随 Base Font Size 自动缩放，移除冗余英文字眼)：**
```text
[性能探测数据] (动态基准字号 calc 映射)
FPS: 60    DrawCall: 120

[资源内存排行] (动态基准字号 calc 映射)
| 资源名称... | ...
```

## 3. 功能需求 (Functional Requirements)

### 3.1 根因分析
1. **未接入字号系统**：性能与渲染分析面板在先前的迭代中引入了大量单独的 inline-style (如 `font-size: 14px`)，没有复用根容器下发的 `--base-font-size` 变量。根因可追溯至 [index.html:L228](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L228) 和 [RenderDebugger.ts:L35](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/components/RenderDebugger.ts#L35)。
2. **文本冗余**：开发早期的双语释义残留。如 `(Tick)`，`(TOP)` 等冗余中存在于 [index.html:L226](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L226)。

### 3.2 具体修复方案

**改动点一：性能面板文本精简及字体映射**
在 `index.html` 的 Tab 4 (性能分析) 中，去除中英混排，引入 `var(--base-font-size, 13px)` 级联替代硬编码。
* 修复目标：[index.html:L226](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L226)
```html
<!-- 改动前 -->
<h4 style="margin: 0 0 10px 0; color: #88c;">性能探测数据 (Tick)</h4>
<div style="display: flex; gap: 15px;">
    <span style="font-family: monospace; font-size: 14px; color: #4CAF50;">FPS: {{ globalState.profiler?.tick?.fps }}</span>
</div>

<!-- 改动后 -->
<h4 style="margin: 0 0 10px 0; color: #88c;">性能探测数据</h4>
<div style="display: flex; gap: 15px;">
    <span style="font-family: monospace; font-size: calc(var(--base-font-size, 13px) + 1px); color: #4CAF50;">FPS: {{ globalState.profiler?.tick?.fps }}</span>
</div>
```

**改动点二：渲染诊断器字体映射**
由于该页面大量使用了 12px、13px 样式，使用批量匹配将之置换为基准值换算公式。
* 修复目标：[RenderDebugger.ts:L11](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/components/RenderDebugger.ts#L11)
```typescript
// 改动前
<div style="font-size: 12px; color: #aaa;">
<span style="font-size: 13px; font-weight: bold;">

// 改动后
<div style="font-size: calc(var(--base-font-size, 13px) - 1px); color: #aaa;">
<span style="font-size: var(--base-font-size, 13px); font-weight: bold;">
```

### 3.3 现有机制复用说明
* **机制复用**：完全依靠上次架构引入的 `#app` CSS 变量节点 `--base-font-size`，无需注入任何新的 Vue 响应式状态。
* **样式级联**：组件化结构并未切断阴影树 (Shadow DOM)，因此通过全局 `var()` 即可直接承袭变量。

## 4. 边界情况 (Edge Cases)

1. **场景**：用户字体放到最大 (20px) 导致渲染面板表格破版。
   **风险**：由于渲染组件具有密集的数据列，可能会纵向换行遮挡内容。
   **缓解策略**：使用 `calc()` 锁定缩小区间（如保证表格字号比主线基准只增长部分属性），并利用表格自身在超小屏幕下的水平滚动条避免完全崩塌。
2. **场景**：部分被置换为 `calc(var(..) + 1px)` 的数值引发了 Flex 高度断层。
   **风险**：原本严格 `14px` 与容器高度 35px 刚好居中，可变字号引发跑板偏移。
   **缓解策略**：保证相关 flex 布局使用了 `align-items: center` 而非固定的 `margin-top`。
3. **场景**：Vue 编译组件模板中的特殊字符转义。
   **风险**：如果使用复杂的 ES6 模板字符串，插入 `${}` 和 `--` `var` 在构建时可能破坏字符串闭合。
   **缓解策略**：保持原生的原生 HTML 内联形式，`calc(var(--base-font-size, 13px) - 1px)`。
4. **场景**：移除了带有特殊含义标识的文本 `(Tick)`，可能让开发者迷失了其度量标准。
   **风险**：纯文字"性能探测数据"或许被误解为一个周期性的综合指标。
   **缓解策略**：下方指标项保持精确词缀 (FPS, DrawCall, RenderTime等)，本身自带明显的 Tick 表征能力。

## 5. 涉及文件清单

| 文件路径 | 改动类型 | 说明 |
|----------|----------|------|
| `src/panel/index.html` | 修改 | 将 Tab 4 / Tab 2 内的固定 `font-size` 均换算成基于相对值的动态公式，并抹除括号内的外语表述。 |
| `src/panel/components/RenderDebugger.ts` | 修改 | 解决遗留的大量纯 `10px`, `11px`, `12px` 写法，接通 CSS Var。 |
