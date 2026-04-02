# UI 界面全局缩放与设置面板规范

## 1. 背景 (Background)
当前的 MCP Inspector 界面是在 2K 高中分辨率环境下进行设计的，固定像素的内边距、字体和按钮大小在 1080P 或更低分辨率的显示器（如笔记本屏幕）下会出现界面元素拥挤、堆叠和截断的现象。为了提升不同屏幕尺寸下的响应能力，同时也为了日后能够接入更多的自定义选项，我们需要引入全局“UI 缩放”功能，并在右侧 Tabs 面板中扩展提供一个独立的“设置 (Settings)”页签。

### 关联历史参考
此前我们在 [index.html:L18](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L18) 使用了 `narrow-tab-nav` 折叠文字等 CSS 媒体查询方案，但这无法解决字体大小在极窄下的拥挤问题，全局缩放可从底层解决这一痛点。

---

## 2. 视觉需求 (Visual Requirements)

我们需要在右侧的标签栏末尾追加“设置”页签，并在其内容区域实现缩放控制控件（支持 Range 滑块与数值回显）。

```text
================= 改动前 =================
[标签栏]
[节点树] [开发者工具] [性能分析] [渲染诊断] [Cocos信息] [扩展]

[内容区]
(按现有功能渲染)

================= 改动后 =================
[标签栏] 
[节点树] [开发者工具] ... [扩展] [⚙️ 设置]

[内容区 (当点击设置时)]
+-------------------------------------------------------------+
| 偏好设置                                                    |
|-------------------------------------------------------------|
| UI 界面缩放比例 (UI Scale)                                  |
| 如果面板在低分辨率屏幕下显示拥挤，可调低此比例。            |
|                                                             |
| [----🔵----------] 80%  [重置]                              |
+-------------------------------------------------------------+
```

---

## 3. 功能需求 (Functional Requirements)

### 3.1 根因分析
界面拥挤的根因在于部分样式强依赖了硬编码像素（如 `font-size: 13px`、`padding: 8px 15px`），这在 [index.html:L5](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L5) 中随处可见：
```css
.tab-item { padding: 8px 15px; font-size: 13px; /* 固化导致挤压 */ }
```
如果不重写庞杂的响应式 CSS，那么引入 Electron 底层的 `webFrame.setZoomFactor` 或 DOM 级别的 `zoom` 样式，是解决该问题最高效降维的方法。

### 3.2 具体修复方案

1. **追加设置页签结构**：在 [useTabs.ts:L4](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/composables/useTabs.ts#L4) 的配置中注入项。
```typescript
// 改动前
const baseTabsTemplate = [
    { id: 0, name: '节点树', icon: '🌲' },
    // ...
    { id: 3, name: '扩展', icon: '🔌' }
];

// 改动后
const baseTabsTemplate = [
    // ...
    { id: 3, name: '扩展', icon: '🔌' },
    { id: 6, name: '设置', icon: '⚙️' } // 新增设置标签
];
```

2. **状态注入**：在 [store.ts:L11](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/store.ts#L11) 的 `globalState` 内新增持久化缩放标识。
```typescript
// 改动前
export const globalState = reactive({
    isGamePaused: false as boolean,
    // ...
});

// 改动后
export const globalState = reactive({
    isGamePaused: false as boolean,
    uiScale: 1.0 as number,
    // ...
});
```

3. **视图渲染与绑定**：在 `index.html` 添加内容页，并在 `index.ts` 监听以应用 Electron Zoom。
```typescript
// src/panel/index.ts (缩放监听代码段)
const electron = require('electron');
watch(() => globalState.uiScale, (newVal: number) => {
    try {
        if (electron && electron.webFrame) {
            electron.webFrame.setZoomFactor(newVal); 
        } else {
            document.body.style.zoom = newVal.toString(); // Fallback
        }
        window.localStorage.setItem('mcp-ui-scale', newVal.toString());
    } catch(e) {}
}, { immediate: true });
```

### 3.3 现有机制复用清单
*   **状态机制**：复用了 [store.ts:L3](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/store.ts#L3) 中已存在的 `globalState` 响应式黑板。
*   **拖拽排序**：设置 Tab 作为新的 `id: 6` 将自动被 `useTabs.ts` 中现存的拖放排序器管控，无需额外手写。
*   **持久化系统**：复用现有的 `localStorage` 读取/存储模式进行初始状态还原。

---

## 4. 涉及文件清单

| 文件名 | 改动类型 | 说明 |
| :--- | :--- | :--- |
| `src/panel/composables/useTabs.ts` | 修改 | 在 `baseTabsTemplate` 中增加 `{ id: 6, name: '设置' }` |
| `src/panel/store.ts` | 修改 | 向 `globalState` 注册 `uiScale: 1.0` |
| `src/panel/index.ts` | 修改 | 在 `setup` 中注入 `watch` 以监听并执行 `webFrame.setZoomFactor` 变更 |
| `src/panel/index.html` | 修改 | 新增 `activeTab === 6` 的视图界面，渲染包含 Slider 与文字回显的控件 |

---

## 5. 边界情况 (Edge Cases)

1.  **场景：缩放比例数值失控（极端大或小）**。
    *   **风险**：用户如果将比例调至 `0.1` 屏幕变为无法点击的极小马赛克，导致无法恢复。
    *   **缓解策略**：在 `<input type="range">` 中强制限定 `min="0.5" max="1.5"`，防止比例逃逸。
2.  **场景：持久化缓存读取乱码**。
    *   **风险**：早期 localStorage 若存入非法字符会导致 `parseFloat(NaN)`，使得渲染树异常甚至白屏。
    *   **缓解策略**：防御性判定如果 `isNaN(parseFloat(savedScale))`，则忽略外部读取并强行回退到 `1.0`。
3.  **场景：Electron APIs 在 Web 脱壳等非主进程环境丢失**。
    *   **风险**：调试时若不在 Creator Editor Node.js 宿主内运行，`require('electron')` 抛出崩溃或 `undefined.setZoomFactor`。
    *   **缓解策略**：加上 Try Catch 包裹与防御。如果 `webFrame` 空缺，则降级使用 CSS 的 `document.body.style.zoom = newVal.toString()` 以达成相似目的。
4.  **场景：缩放对内部 `Resizer` 分隔条原生鼠标坐标的破坏**。
    *   **风险**：CSS Zoom 经常会使得 `event.clientX` 与计算的宽度不一致，导致鼠标拖拽栏位和实际光标分离。
    *   **缓解策略**：首选并强制使用 Electron 原生级的 `webFrame.setZoomFactor` 进行逻辑像素层级的映射，此方案通过宿主实现统一，能有效规避坐标系割裂问题。
