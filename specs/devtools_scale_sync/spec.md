# DevTools UI Scale Sync Specification

## 1. 背景
用户报告在调整“⚙️设置”中的“UI 界面缩放比例 (UI Scale)”后，右侧的开发者工具（DevTools）视图位置和大小没有跟随变化，导致界面脱节穿模。

此问题不仅存在于缩放滑块拉动时，由于底层架构缺乏细粒度的布局协同，它同样会导致其他动态改变宽度的操作失效。

## 2. 视觉需求 (Visual Requirements)

```text
调整缩放前 (Scale 1.0):
┌─ 容器 (devtoolsView) ───────┐
│ [BrowserView 100% 贴靠]     │
│                             │
└─────────────────────────────┘

调整缩放后 (Scale 0.8) 出现错位:
┌─ 容器 (视觉收缩) ─────┐
│                       │
└───────────────────────┘
     [BrowserView 遗留在原尺寸/原坐标] 

修复后预期:
┌─ 容器 (视觉收缩) ─────┐
│ [BV 跟随缩小并贴靠]   │
└───────────────────────┘
```

## 3. 功能需求 (Functional Requirements)

### 3.1 根因分析

该缺陷由以下几个技术特点碰撞产生：
1. **渲染解耦机制**：不同于左侧的 `<webview>`（这是一种特化的 DOM 结构），右侧的开发者工具被剥离为了原生的高特权 [BrowserView](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/composables/useDevTools.ts#L6)。它脱离了 Chromium DOM 渲染树，悬浮于 Editor 应用程序之上。
2. **缺乏响应式通知**：当 `globalState.uiScale` 通过 `#app` 上的 CSS `zoom` 引发剧烈排版倒退时，[DevTools 更新引擎](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/composables/useDevTools.ts#L98) 目前仅仅只在 `window.resize`（窗体物理缩放）以及页签切换时执行重新定位。
3. **坐标落后错位**：不仅是缩放导致 BrowserView 没有对齐，由于没有侦听 [rightPanelWidth](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/composables/useLayout.ts#L9)，如果用户拖拽中间分割线，BrowserView 其实同样无法跟随变化（直到缩放窗体）。

### 3.2 修复方案

**改动 1：向外部暴露宽度绑定依赖，完善现有系统**
在 `useDevTools.ts` 中，接收 `rightPanelWidth` 作为依赖项，并在其发生变化时，利用 Vue `watch` 自动刷新包裹。这同时修补了宽度条拖拽的遗留隐患。
```typescript
// 改动前 (缺少宽度和同步机制)
export function useDevTools(globalState: any, gameView: any, devtoolsView: any, activeTab: any) {

// 改动后
export function useDevTools(globalState: any, gameView: any, devtoolsView: any, activeTab: any, rightPanelWidth: any) {
    const { watch } = require('vue');
    // ...
    watch(rightPanelWidth, () => {
        if (activeTab.value === 1 && devToolsBV) {
            updateBrowserViewBounds();
        }
    });
```

**改动 2：强制在 uiScale 缩放响应时异步触发同步**
在 `index.ts` 中，当收到 `uiScale` 值变动时，不光对 `panelAppElement` 设置 `zoom`，还要借助于 setTimeout 宏任务（等待浏览器重排结束）精准校正 `BrowserView`。
```typescript
// 改动前
    if (panelAppElement) {
        panelAppElement.style.zoom = newVal.toString();
    }
    window.localStorage.setItem('mcp-ui-scale', newVal.toString());

// 改动后
    if (panelAppElement) {
        panelAppElement.style.zoom = newVal.toString();
    }
    window.localStorage.setItem('mcp-ui-scale', newVal.toString());
    
    // 异步等待浏览器排版重算后，对脱离 DOM 树的原生 BrowserView 进行重压合
    setTimeout(() => {
        if (devToolsSystem.updateBrowserViewBounds) {
            devToolsSystem.updateBrowserViewBounds();
        }
    }, 20);
```

### 3.3 现有机制复用说明
- 完全复用了 `useDevTools.ts` 中的 [updateBrowserViewBounds()](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/composables/useDevTools.ts#L12) 核心函数。
- 该函数使用 `getBoundingClientRect()` 吸附目标挂载对象 `devtoolsView`，由于是在 ` setTimeout` 之后调用，此时返回值的 `rect.left` 与 `rect.width` 会在 CSS `zoom` 环境下被自动缩略映射至最正确的视口象限内，不需要额外追加乘除法！

## 4. 涉及文件清单

| 文件路径 | 改动类型 | 说明 |
| :--- | :--- | :--- |
| `src/panel/composables/useDevTools.ts` | 修改 | 追加 `rightPanelWidth` 依赖参数并启用拖拉侦听同步 |
| `src/panel/index.ts` | 修改 | 入参签名更新，同时在 `uiScale` 监听池触发 `updateBrowserViewBounds` 回调 |

## 5. 边界情况 (Edge Cases)

1. **非 Tab 1 时触发缩放**
   - **风险**：如果在非“开发者工具”面板下缩放界面，`updateBrowserViewBounds` 可能会找不到活跃的 `devToolsBV`。
   - **缓解策略**：`updateBrowserViewBounds` 函数首行为 `if (!devToolsBV) return;` 安全拦截，且切回 Tab 时原有的逻辑会自动修正尺寸，不会崩溃。
2. **异步重排时序跳动 (Flash of Invalid Bounds)**
   - **风险**：调用缩放后 DOM 的 Layout 计算需要半帧时间，如果立即执行 `getBoundingClientRect` 可能会获得错误的大数值。
   - **缓解策略**：利用 `setTimeout(..., 20)` 原理制造渲染空档期，确切取回浏览器重排后的正确数值。
3. **性能高频抖动**
   - **风险**：如果用户拉拽右侧拖拉条引发海量变化，是否有爆栈或 Electron 通信风暴可能？
   - **缓解策略**：`setBounds` 在 Electron 本地环境通信中表现尚可；如有明显卡顿后续可将 watch 方法套入防抖池（但目前保持高刷新以达到视觉随动是首选）。
4. **降级模式不可控**
   - **风险**：使用 `alert` / `devToolsError` 占据画面时，其实没有 BV。
   - **缓解策略**：`updateBrowserViewBounds` 对 `(!container)` 与越界状态一并短路，纯防御性设计无后遗症。
