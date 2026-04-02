# 全局 UI 缩放与设置面板实施计划

根据 `specs/ui_scale_settings/spec.md` 的规范定义，以下是针对低分辨率下界面拥挤问题所制定的修正实施计划。

## 1. 架构设计 (Architecture)

### 文件清单表格

| 文件路径 | 所属层级 | 改动性质 | 一句话说明 |
| :--- | :--- | :--- | :--- |
| `src/panel/composables/useTabs.ts` | `[Frontend]` | 修改 | 增加“设置”页面标签以接管偏好修改 |
| `src/panel/store.ts` | `[Frontend]` | 修改 | 为 `globalState` 增加 `uiScale` 全局响应式状态变量 |
| `src/panel/index.ts` | `[Frontend]` | 修改 | 监听 `uiScale` 并安全接入 `webFrame.setZoomFactor` API |
| `src/panel/index.html` | `[Frontend]` | 修改 | 编写并添加 Tab 6 (设置面板) 的 Vue 模版及交互滑块 |
| `UPDATE_LOG.md` | `[Docs]` | 修改 | 升级并同步变更日志记录 |

### 架构影响评估
> [!NOTE]
> 本次改动不涉及核心通信架构变更。主要采用了 Electron 提供的逻辑屏幕映射（WebFrame）作为最高层级缩放降维手段，与现存的 `globalState` 以及持久化 `localStorage` 组件高度融洽。

## 2. 分步实施 (Step-by-Step)

### 阶段 A: 代码修改

- [x] `[Frontend]` 修改 `src/panel/store.ts`，在 `globalState` 中加入基于界面的 `uiScale` 锚点：
```typescript
export const globalState = reactive({
    // ... (保留其它状态)
    isNodePickerActive: false as boolean,
    previewPort: 7456 as number,
    uiScale: 1.0 as number,
});
```

- [x] `[Frontend]` 修改 `src/panel/composables/useTabs.ts`，在 `baseTabsTemplate` 中末尾加入“设置”页签配置以对接可插拔结构：
```typescript
const baseTabsTemplate = [
    { id: 0, name: '节点树', icon: '🌲' },
    { id: 1, name: '开发者工具', icon: '🛠' },
    { id: 4, name: '性能分析', icon: '💡' },
    { id: 5, name: '渲染诊断', icon: '🔮' },
    { id: 2, name: 'Cocos信息', icon: 'ℹ️' },
    { id: 3, name: '扩展', icon: '🔌' },
    { id: 6, name: '设置', icon: '⚙️' } // 增加这一项
];
```

- [x] `[Frontend]` 在 `src/panel/index.ts` 的 `setup()` 函数域内，引入 Electron 原生组件，拦截缓存信息并将其代理侦听：
```typescript
// 寻找 const devToolsSystem = ... 下方插入
const electron = require('electron');

const savedScale = window.localStorage.getItem('mcp-ui-scale');
if (savedScale && !isNaN(parseFloat(savedScale))) {
    globalState.uiScale = parseFloat(savedScale);
}

watch(() => globalState.uiScale, (newVal: number) => {
    try {
        if (electron && electron.webFrame) {
            electron.webFrame.setZoomFactor(newVal);
        } else {
            document.body.style.zoom = newVal.toString();
        }
        window.localStorage.setItem('mcp-ui-scale', newVal.toString());
    } catch(e) {}
}, { immediate: true });
```

- [x] `[Frontend]` 修改 `src/panel/index.html` 增补渲染目标试图树：
```html
<!-- 在现有的 Tab 5 节点块之后插入配置专用 Tab 6 面板 -->
<div v-show="activeTab === 6" style="position: absolute; inset: 0; padding: 15px; background: #1e1e1e; color: #ddd; overflow-y: auto;">
    <h4 style="margin: 0 0 15px 0; color: #88c; border-bottom: 1px solid #333; padding-bottom: 5px;">偏好设置</h4>
    
    <div style="margin-bottom: 20px; background: #252525; padding: 12px; border-radius: 4px; border: 1px solid #333;">
        <div style="font-size: 13px; font-weight: bold; margin-bottom: 8px;">UI 界面缩放比例 (UI Scale)</div>
        <div style="font-size: 12px; color: #aaa; margin-bottom: 10px;">如果面板在低分辨率屏幕下显示拥挤，可调低此比例（缓存本地）。</div>
        <div style="display: flex; gap: 10px; align-items: center;">
            <input type="range" v-model.number="globalState.uiScale" min="0.5" max="1.5" step="0.05" style="width: 200px;">
            <span style="font-family: monospace; font-size: 13px; background: #111; padding: 3px 6px; border-radius: 3px; min-width: 40px; text-align: center;">{{ (globalState.uiScale * 100).toFixed(0) }}%</span>
            <button class="icon-btn" style="padding: 2px 8px; width: auto;" @click="globalState.uiScale = 1.0" title="重置">重置</button>
        </div>
    </div>
</div>
```

### 阶段 B: 编译验证

- [x] `[Build]` 执行 `npm run build` 确保 TypeScript 解析器和 Vite / ESBuild 等编译链顺利通过新补充的 `electron.webFrame` 与新增字典逻辑。

### 阶段 C: 文档更新

- [x] `[Docs]` 更新 `UPDATE_LOG.md` 以及必要情况下的项目说明文档，正式对外提供说明信息。
```markdown
### ✨ 新特性
- **支持全局 UI 缩放与设置面板 (Support Global UI Scaling and Settings Panel)**
  - 在右侧标签栏增加了专属的“设置 (⚙️)”入口。
  - 通过引入底层 Electron WebFrame 的原生倍率控制，妥善解决了在 1080P 或低分辨率环境下界面元素的拥堵排解能力。
```
