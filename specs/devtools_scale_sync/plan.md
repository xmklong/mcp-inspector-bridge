# DevTools 缩放及挂载重压合同步实施计划

根据 `specs/devtools_scale_sync/spec.md` 提供的架构要求，以下是确保独立的 BrowserView 能够完美跟随 UI 布局变动（缩放、面板拖拉）的执行计划。

## 1. 架构设计 (Architecture)

### 文件清单表格

| 文件路径 | 所属层级 | 改动性质 | 一句话说明 |
| :--- | :--- | :--- | :--- |
| `src/panel/composables/useDevTools.ts` | `[Frontend]` | 修改 | 引入响应式宽度参数 `rightPanelWidth` 以侦听重定位 |
| `src/panel/index.ts` | `[Frontend]` | 修改 | 在变更 `uiScale` 时通过宏队列补偿执行位置同步，同时修补入参映射 |

### 架构影响评估
> [!NOTE]
> 本次改动不涉及核心架构通信和内存持久化的实质性变更。主要补充了 Vue 环境下对跨界隔离渲染的独立窗体（原生 BrowserView）在 CSS 排版发生突变（被动缩展）时的事件通知缺失问题，使其具有与内层 DOM 相似的视觉响应能力。

## 2. 分步实施 (Step-by-Step)

### 阶段 A: 代码修改

- [x] `[Frontend]` 修改 `src/panel/composables/useDevTools.ts`，追加 `rightPanelWidth` 参数，并在其内部注册侦听器，实现拖拉分割条时开发者工具动态贴靠：
```typescript
// 修改函数签名
export function useDevTools(globalState: any, gameView: any, devtoolsView: any, activeTab: any, rightPanelWidth: any) {
    const { watch, nextTick, onUnmounted } = require('vue');
    // ... 在原有逻辑内追加侦听
    watch(rightPanelWidth, () => {
        if (activeTab.value === 1 && devToolsBV) {
            updateBrowserViewBounds();
        }
    });
// ...
```

- [x] `[Frontend]` 修改 `src/panel/index.ts` 中调用 `useDevTools` 的实参传入点，以衔接上一条修改：
```typescript
// 将 `layoutSystem.rightPanelWidth` 参入
const devToolsSystem = useDevTools(globalState, gameView, devtoolsView, activeTab, layoutSystem.rightPanelWidth);
```

- [x] `[Frontend]` 修改 `src/panel/index.ts` 中的 `uiScale` 监听函数，借由 `setTimeout(20ms)` 的脱管空窗期强制调用 `devToolsSystem.updateBrowserViewBounds()` 使得 BrowserView 去咬合缩放后的新 DOM 盒子：
```typescript
                watch(() => globalState.uiScale, (newVal: number) => {
                    try {
                        // ... 原有逻辑
                        if (panelAppElement) {
                            panelAppElement.style.zoom = newVal.toString();
                        }
                        window.localStorage.setItem('mcp-ui-scale', newVal.toString());

                        // 新增：异步等待浏览器重排后重贴合 DevTools BV
                        setTimeout(() => {
                            if (devToolsSystem.updateBrowserViewBounds) {
                                devToolsSystem.updateBrowserViewBounds();
                            }
                        }, 20);
                        
                    } catch(e) {}
                });
```

### 阶段 B: 编译验证

- [x] `[Build]` 在终端执行 `npm run build`，确保 Typescript 代码安全通过静态编译，不因参数数量不匹配或属性未检出而产生错误拦截。

### 阶段 C: 文档更新

- [x] `[Docs]` 更新项目根目录的 `UPDATE_LOG.md`，追加“修复全局缩放与面板拖拽未同步触发开发者视图边界贴合的穿模重叠现象”漏洞修补声明。
