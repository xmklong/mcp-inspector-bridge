# 顶部操作栏响应式自动换行 (Toolbar Responsive Wrap)

## 背景

MCP Inspector Bridge 插件面板的左侧 Game Panel 顶部有一条固定 35px 高度的操作栏（[index.html:78](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L78)），包含以下元素从左到右依次排列：

1. **按钮组 `.btn-group`**（6 个 `26x26` 图标按钮）— 刷新/暂停/单帧/FPS/静音/拾取
2. **分辨率选择框 `.resolution-select`**（`<select>`）— 如 `Apple iPhone 7 (750x1334)`
3. **横竖屏切换按钮** `🔄`
4. **弹性占位 `flex: 1`**
5. **标识文本 `MCP Bridge`**

### 当前问题

当面板宽度极端狭窄时（用户通过拖拽分隔条或停靠窗口的方式），所有元素被强制挤在同一行（固定 `height: 35px`），存在以下视觉缺陷：

- **分辨率选择框文本完全不可读**：虽然已有 `.narrow-mode .resolution-select { max-width: 100px; }` 的响应式规则（[index.html:17](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L17)），但 `max-width: 100px` 仍然可以被 flexbox 进一步压扁到接近 0px（因为 `flex-shrink: 1` 且没有 `min-width` 保护）
- **没有最小宽度保护**：`<select>` 元素没有设置 `min-width`，在极窄条件下内容被完全截断，用户无法辨识当前选中的是哪个分辨率
- **操作栏固定单行不换行**：`overflow: hidden` 直接截断所有超出元素

### 现有响应式机制分析

当前项目中 `isNarrow` 的判定阈值为 `rect.width < 500`（[useLayout.ts:135](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/composables/useLayout.ts#L135)），该阈值由 `ResizeObserver` 监听游戏容器 `#game-mount-wrap` 的宽度触发。但此布尔值目前只在以下场景使用：

- 给左侧面板添加 `.narrow-mode` 类（[index.html:76](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L76)）
- 缩小 MCP Bridge 标识文字（[index.html:97](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L97)）
- 性能面板双栏转单栏（[index.html:219](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L219)）

该机制**未覆盖**顶部操作栏的自动换行需求。

---

## 视觉需求 (Visual Requirements)

### 正常宽度（≥ 500px）— 保持现状

所有控件在单行水平排列，与当前一致：

```
[↻][⏸][⏭][📊][🔊][🎯]  [Apple iPhone 7 (750x1334) ▼]  [🔄]  ···  MCP Bridge
```

### 极窄宽度（< 500px）— 自动换行为两行

操作栏应自动扩展为两行：

```
第一行: [↻][⏸][⏭][📊][🔊][🎯]  [🔄]          MCP Bridge
第二行: [Apple iPhone 7 (750x1334) ▼                      ]
```

具体要求：
- **第一行**：按钮组 + 横竖屏切换按钮 + MCP Bridge 标识（右对齐）
- **第二行**：分辨率选择框独占一行，`width: 100%` 充满可用空间
- **操作栏高度自适应**：从固定 `35px` 改为 `min-height: 35px` + `flex-wrap: wrap`
- **行间距**：两行之间保持 `4px` 的间距（通过 `row-gap` 实现）
- **底部间距**：窄模式下操作栏底部补充 `4px` padding 防止第二行贴底

### 分辨率选择框最小宽度保护

无论是否处于窄模式：
- 分辨率选择框必须设置 `min-width: 120px`，确保至少能看到设备名称的前几个字符（如 `Apple iPho...`）
- 在正常模式下继续保持 `flex-shrink: 1` 的弹性收缩，但受 `min-width` 保护不会被压扁到无法阅读

---

## 功能需求 (Functional Requirements)

### 根因分析

1. 操作栏容器（[index.html:78](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L78)）使用了 `height: 35px` 固定高度 + `overflow: hidden`，导致任何超出高度的内容被直接裁剪
2. `<select>` 元素缺少 `min-width` 声明（[index.html:88](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L88)），在 flexbox 布局中 `flex-shrink: 1` 会将元素压缩到 0
3. `.narrow-mode .resolution-select { max-width: 100px }` 只限制了上限，未保护下限

### 具体修复方案

#### 1. CSS 样式修改（index.html `<style>` 区域）

**新增** `.resolution-select` 基础样式：

```css
/* 分辨率选择框最小宽度保护 */
.resolution-select { min-width: 120px; }
```

**修改** `.narrow-mode` 响应式规则，新增操作栏换行支持：

```css
/* 响应式：当宽度不足时，操作栏自动换行为两行 */
.narrow-mode .resolution-select { max-width: none; width: 100%; order: 10; }
.narrow-mode .toolbar-rotate-btn { order: 2; }
.narrow-mode .toolbar-spacer { order: 3; flex-basis: 0; }
.narrow-mode .toolbar-brand { order: 4; }
```

#### 2. 操作栏容器 HTML 修改（index.html:78）

将操作栏从固定 `height: 35px` 改为 `min-height: 35px`，并添加 `flex-wrap: wrap`：

```html
<div :style="{
    minHeight: '35px',
    background: '#3c3c3c',
    display: 'flex',
    alignItems: 'center',
    padding: globalState.isNarrow ? '4px 10px' : '0 10px',
    gap: '5px',
    flexWrap: 'wrap',
    rowGap: '4px'
}">
```

#### 3. 分辨率选择框增加最小宽度保护（index.html:88）

保持现有逻辑不变，通过 CSS 类 `.resolution-select` 全局生效 `min-width: 120px`。

#### 4. 子元素增加语义类名

为了在窄模式下通过 CSS `order` 重排元素，给以下 HTML 元素添加类名：

- 横竖屏按钮（[index.html:95](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L95)）：增加 `class="icon-btn toolbar-rotate-btn"`
- 弹性占位 div（[index.html:96](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L96)）：增加 `class="toolbar-spacer"`
- MCP Bridge 标识 div（[index.html:97](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L97)）：增加 `class="toolbar-brand"`

---

## 涉及文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/panel/index.html` | MODIFY | 修改 `<style>` 新增/调整响应式规则；修改操作栏容器为 `flex-wrap` 自适应高度；给子元素增加语义类名 |

> [!NOTE]
> 本次修改仅涉及模板与样式，**不涉及** `useLayout.ts` 等 composable 的逻辑改动。`isNarrow` 的阈值（500px）和判定机制维持不变，复用现有基础设施。

---

## 边界情况 (Edge Cases)

1. **面板宽度在 500px 临界值反复抖动**
   - `isNarrow` 由 `ResizeObserver` + `requestAnimationFrame` 驱动，已有天然的防抖机制
   - CSS `flex-wrap` 的换行与 `order` 重排均为纯 CSS 过渡，不会因频繁切换产生闪烁

2. **分辨率选择框在窄模式下 `width: 100%` 超出容器**
   - 操作栏容器已有 `padding: 0 10px`
   - `<select>` 设置 `width: 100%` 时应同时确保 `box-sizing: border-box` 防止边框溢出

3. **"自动充满 (Fit Window)" 选项文本较短，在宽模式下 120px 足够显示**
   - 最长选项 `Apple iPhone 12 Pro Max (1284x2778)` 在 120px 下约显示为 `Apple iPhone 1...`，仍可辨识设备类型

4. **窄模式下第二行分辨率选择框紧贴操作栏底边**
   - 通过 `rowGap: 4px` + 窄模式下 `padding: 4px 10px`（上下各 4px）确保视觉间距

5. **Webview 容器高度因操作栏变高而减少**
   - 操作栏在窄模式下从 35px 增长为约 70px（35 + 4 gap + 26 select + 4 padding），对下方 `flex: 1` 的游戏容器影响极小（仅多占约 35px），且这种情况只在面板极窄时发生，此时游戏预览本身也已很小

6. **用户在窄模式下切换分辨率后面板变宽**
   - `isNarrow` 由游戏容器宽度决定，分辨率切换改变的是游戏内容缩放比例而非面板宽度，两者独立不冲突
