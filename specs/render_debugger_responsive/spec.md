# 渲染诊断面板响应式 UI 规范 (Spec)

## 4.1 背景
当前《Render Pipeline 流水线诊断》面板（位于 [RenderDebugger.ts:L4](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/components/RenderDebugger.ts#L4)）主要采用了固定百分比（如 25%、50%）的宽度策略来约束左、中、右三栏，以及使用不带折行的 `space-between` 进行顶部标题与按钮栏的排版。
当用户将插件侧边栏或整个应用窗口压缩到较窄的尺寸时，当前逻辑会导致：
- 顶部标题区和按钮控件挤压重叠，甚至超出屏幕被截断（[RenderDebugger.ts:L8](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/components/RenderDebugger.ts#L8)）。
- "全景三栏布局区"内容极度折缩，单列由于 `width: 25%` 强制计算出的独立像素宽度可能不足 80px，造成文字重叠、难以辩读，重绘图传画布区域的观看体验也会大幅度受损（见 [RenderDebugger.ts:L73](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/components/RenderDebugger.ts#L73)）。
通过引入 Flex 弹性容器下的 `flex-wrap` 以及基于特征宽度的 `flex-basis/min-width` 折行响应策略，可以实现类似 CSS 容器查询（Container Queries）的效果，在不同尺寸下保持阅读体验。

## 4.2 视觉需求 (Visual Requirements)
在改造之后，三栏结构以及头部的排布应当根据外在约束无缝流转：

```text
=================== [宽屏模式 (例如 Width >= 800px)] ===================
[标题及描述区域                   ]       [ 侦听选项 | 诊断截帧/恢复 | 历史 ]

+--------------------+ +--------------------------+ +--------------------+
| 渲染队列 (1 DC)     | | 单步图传 (Step Replay)   | | 批次参数明细       |
| DrwaCall #0        | |                          | | Primitive: ...     |
|   🖼️ cmd_sprite    | |        ( 画布区域 )       | | Src Blend: ...     |
+--------------------+ +--------------------------+ +--------------------+


=================== [窄屏模式 (例如 Width <= 500px)] ===================
[标题及描述区域                                                        ]
[ 侦听选项 | 诊断截帧/恢复 | 历史                                        ]

+----------------------------------------------------------------------+
| 单步图传 (Step Replay) - (原中央区域提权优先展示核心视觉)                 |
|                            ( 画布区域 )                               |
+----------------------------------------------------------------------+
+----------------------------------------------------------------------+
| 渲染队列 (1 DC)                                                       |
| DrwaCall #0                                                          |
|   🖼️ cmd_sprite                                                      |
+----------------------------------------------------------------------+
+----------------------------------------------------------------------+
| 批次参数明细                                                          |
| Primitive: ...                                                       |
+----------------------------------------------------------------------+
```

*(注：在具体实现中，因为 `order` 搭配使用可能会打乱 DOM 逻辑顺序并产生聚焦问题，推荐通过流式自然折叠，即左侧（DCs）、中间（Canvas）、右侧（Details）在窄屏下自动堆叠为上、中、下三层。)*

## 4.3 功能需求 (Functional Requirements)

### 1. 顶部控制栏折叠重组
* **根因定位**：顶部采用硬性 `display: flex; align-items: center; justify-content: space-between;`，如果缺乏 `flex-wrap: wrap` 在窄屏时必然导致文字或按钮互挤。参见 [RenderDebugger.ts:L8-L16](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/components/RenderDebugger.ts#L8)。
* **修复方案**：

```html
<!-- 原始代码片段 -->
<div style="flex-shrink: 0; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
    <div>
        <h3 style="margin: 0 0 5px 0; color: #fff;">Render Pipeline 流水线诊断</h3>
...
    </div>
    <div style="display: flex; gap: 10px;">
```

```html
<!-- 修复后代码片段 -->
<div style="flex-shrink: 0; margin-bottom: 10px; display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
    <div style="flex: 1 1 300px;">
        <h3 style="margin: 0 0 5px 0; color: #fff;">Render Pipeline 流水线诊断</h3>
...
    </div>
    <div style="display: flex; gap: 10px; flex-wrap: wrap; flex: 1 1 auto; justify-content: flex-end;">
```

### 2. 全景三栏布局区柔性网格策略
* **根因定位**：由 `isFrozen && frozenSnapshot` 触发展示的核心区域目前采用的是硬性分块逻辑 `width: 25%`和 `width: 50%`，并在父级应用 `overflow: hidden` 防止滚动。参见 [RenderDebugger.ts:L73](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/components/RenderDebugger.ts#L73)。由于在小视窗下百分比被极度缩小，无法适应容器排版。
* **修复方案**：将父级容器转变为允许垂直滚动和换行的 `flex-wrap`，并且给子容器分派 `flex: 1 1 {基准宽度}`。

```html
<!-- 原始代码片段 -->
<div v-if="isFrozen && frozenSnapshot" style="flex: 1; min-height: 0; display: flex; gap: 10px; overflow: hidden; margin-top: 5px;">
    <div style="width: 25%; background: #1a1a1c; border: 1px solid #333; border-radius: 4px; display: flex; flex-direction: column; overflow: hidden;">
...
    <div style="width: 50%; background: #000; border: 1px solid #333; border-radius: 4px; display: flex; flex-direction: column; overflow: hidden;">
...
    <div style="width: 25%; background: #1a1a1c; border: 1px solid #333; border-radius: 4px; display: flex; flex-direction: column; overflow: hidden;">
```

```html
<!-- 修复后代码片段 -->
<div v-if="isFrozen && frozenSnapshot" style="flex: 1; min-height: 0; display: flex; flex-wrap: wrap; gap: 10px; overflow-y: auto; overflow-x: hidden; margin-top: 5px; align-content: flex-start;">
    <div style="flex: 1 1 200px; min-height: 250px; background: #1a1a1c; border: 1px solid #333; border-radius: 4px; display: flex; flex-direction: column; overflow: hidden;">
...
    <div style="flex: 2 1 300px; min-height: 300px; background: #000; border: 1px solid #333; border-radius: 4px; display: flex; flex-direction: column; overflow: hidden;">
...
    <div style="flex: 1 1 200px; min-height: 250px; background: #1a1a1c; border: 1px solid #333; border-radius: 4px; display: flex; flex-direction: column; overflow: hidden;">
```
当空间不足时，中间的主画布能够保持最小 300px 宽度，左右边栏能够保持至少 200px，一旦总宽 < 720px (`200+300+200+20`)，它们就会自动折成不同排（形成多行 Flex 排版），同时由外层赋予局部 `overflow-y: auto` 以供滚动查看其他层内容。

### 3. 数据表防重叠安全阈值
* **根因定位**：侦听断流时的动态表格未使用 `min-width` 锁定排气限制。
* **修复方案**：由于父级 `<div v-show="!isFrozen" style="... overflow-y: auto;">` 已带有 `auto` 属性，只需对子集 `<table style="width: 100%; ...">` 追加 `min-width: 500px;`（确保即使外层非常窄，至少保证表头能用横向滚动条阅读而不是直接叠在一起）。

### 4. 现有机制复用清单
* 采用直接编辑 `style` 并利用浏览器原生的 Flexbox `flex-grow`/`flex-basis` 特性执行。
* 无需新增或引入复杂的 `isNarrow` 响应变量，也无需使用 ResizeObserver 或 CSS `@media` 媒体查询钩子（对于编辑器内侧边分屏等无法预设 `window` 的情况，流体自适应往往表现更稳健可靠）。

## 4.4 涉及文件清单

| 文件名 | 改动类型 | 改动说明 |
|---|---|---|
| `src/panel/components/RenderDebugger.ts` | 修改 | 将渲染诊断界面中的固定百分比宽度 `width` 替换为响应式流体 `flex` ，以及顶部标题栏引入 `flex-wrap: wrap;` 应对极窄边缘。 |

## 4.5 边界情况 (Edge Cases)

**1. 场景：面板外层总高很小，而三栏换行后变成了垂直堆叠的高度（可能超过了 850px）**
* **风险计算**：如果内层因为折行累积高度庞大，而原来外层并未开放 `overflow-y: auto`，那么折到底部的数据（例如第三块"批次参数明细"）会完全看不见。
* **缓解策略**：在三栏排布的总容器中应用了 `overflow-y: auto`，并给包裹了三者元素的父级增加合适的间隙，确保可使用鼠标滚轮自然下滚操作。

**2. 场景：左侧命令树列表项名称（`cmd.name`）过长**
* **风险计算**：窄模式下如果某个渲染调用的名字极端长，它由于缺乏回退空间可能会撑破 flex-basis 防线引起横向滑条，或者是越过文字裁切逻辑挤压右侧标记。
* **缓解策略**：在 [RenderDebugger.ts:L94](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/components/RenderDebugger.ts#L94) 中，文字包裹 `div` 设置有 `overflow: hidden; white-space: nowrap; text-overflow: ellipsis;` 可有效消化单行截断溢出。需要确认该属性对 `flex` 子项有强力生效支持。

**3. 场景：顶部按钮栏换行导致整个头部高度从 30px 拉高至 70px**
* **风险计算**：高度增加可能挤压下方三栏的有效视窗空间，甚至导致下方主体区域渲染区呈现不足。
* **缓解策略**：给包含主体的块留出 `flex: 1; min-height: 0;`。下方主体自身也有内部滚动 `overflow-y: auto`，可以根据高度自我调整收缩。

**4. 场景：断流侦听事件表格中的 "打断节点"、"上游节点"名字畸低换行**
* **风险计算**：在不给 table 单独加入 `min-width` 时，浏览器将倾向于无限折断节点的命名单词，将其拉伸得像面条一样陡直，极为丑陋。
* **缓解策略**：为 `<table>` 声明 `min-width: 500px;`（不牺牲 `width: 100%`），触发水平 `overflow-x: auto`，保住内容基础可辨识性。
