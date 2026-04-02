# 基础字号设置实施计划 (Plan)

## 1. 架构设计 (Architecture)

### 文件清单表格
| 文件路径 | 层级 | 改动性质 | 说明 |
|----------|------|----------|------|
| `src/panel/store.ts` | [Frontend] | 修改 | 增加 `baseFontSize: 13` 初始化声明 |
| `src/panel/index.ts` | [Frontend] | 修改 | 添加关于 `baseFontSize` 变量的 localstorage 持久化存取与 `#app` 节点 Property 同步 |
| `src/panel/index.html` | [Frontend] | 修改 | 定值 px 替换为基准值动态求值样式 (calc)；增加设置面板 slider 控件 |
| `UPDATE_LOG.md` | [Docs] | 修改 | 追加本次新功能特性的更新发布日志 |

### 架构影响评估
> [!NOTE]
> 本次改动不涉及核心架构变更。单纯应用 CSS 自定义属性 (`--base-font-size`) 的级联传播特性，去除了组件中死板的字号规定，依靠 Vue 原有的 globalState 系统和 localStorage 提供属性绑定。

### 关键流程图 (Mechanism)
```mermaid
graph TD
    User([用户调节面板 Slider]) --> State[Vue 响应式 globalState.baseFontSize]
    State -.-> Watcher((index.ts: Watch 钩子))
    Watcher --> LocalStorage[(window.localStorage 存取)]
    Watcher --> DOM[#app.style.setProperty 注入 CSS Var]
    DOM --> CSS[CSS 变量 calc() 动态衍生各级小/大文本]
```

## 2. 分步实施 (Step-by-Step)

### 阶段 A: 代码修改

- [x] [Frontend] 修改 `src/panel/store.ts` 以支持 `baseFontSize` 变量。
```typescript
// 修改前
export const globalState = reactive({
    // ...
    uiScale: 1.0 as number,
    inspectorLayout: 'horizontal' as 'horizontal' | 'vertical'
});

// 修改后
export const globalState = reactive({
    // ...
    uiScale: 1.0 as number,
    baseFontSize: 13 as number,
    inspectorLayout: 'horizontal' as 'horizontal' | 'vertical'
});
```

- [x] [Frontend] 修改 `src/panel/index.ts` 接入初始化加载和动态侦听持久化能力。
```typescript
// 修改前 (片段)
const savedScale = window.localStorage.getItem('mcp-ui-scale');
// ...
watch(() => globalState.inspectorLayout, (newVal: string) => { /*...*/ });

// 修改后 (片段)
const savedScale = window.localStorage.getItem('mcp-ui-scale');
// ...
const savedFontSize = window.localStorage.getItem('mcp-base-font-size');
if (savedFontSize && !isNaN(parseInt(savedFontSize))) {
    globalState.baseFontSize = parseInt(savedFontSize, 10);
}

watch(() => globalState.baseFontSize, (newVal: number) => {
    try {
        if (panelAppElement) panelAppElement.style.setProperty('--base-font-size', \`\${newVal}px\`);
        window.localStorage.setItem('mcp-base-font-size', newVal.toString());
    } catch(e) {}
});

// 另外在 onMounted 内追加一处： panelAppElement.style.setProperty('--base-font-size', globalState.baseFontSize + 'px');
```

- [x] [Frontend] 修改 `src/panel/index.html` 移除静态 CSS `13px`。
```css
/* 修改前 */
.tab-nav { font-size: 13px; }
.tree-content { font-size: 12px; }
.comp-badge { font-size: 9px; }

/* 修改后 */
.tab-nav { font-size: var(--base-font-size, 13px); }
.tree-content { font-size: calc(var(--base-font-size, 13px) - 1px); }
.comp-badge { font-size: calc(var(--base-font-size, 13px) - 4px); }
```

- [x] [Frontend] 修改 `src/panel/index.html` 底部 Settings Tab 加入 Slider 调整控件。
```html
<!-- 新增代码片段 -->
<div style="margin-bottom: 20px; background: #252525; padding: 12px; border-radius: 4px; border: 1px solid #333;">
    <div style="font-size: var(--base-font-size, 13px); font-weight: bold; margin-bottom: 8px;">基础字号 (Base Font Size)</div>
    <div style="font-size: calc(var(--base-font-size, 13px) - 1px); color: #aaa; margin-bottom: 10px;">作为全局排版基准值 (修改后将立即在本地缓存)。</div>
    <div style="display: flex; gap: 10px; align-items: center;">
        <input type="range" v-model.number="globalState.baseFontSize" min="11" max="18" step="1" style="width: 200px;">
        <span style="font-family: monospace; font-size: var(--base-font-size, 13px); background: #111; padding: 3px 6px; border-radius: 3px; min-width: 40px; text-align: center;">{{ globalState.baseFontSize }}px</span>
        <button class="icon-btn" style="padding: 2px 8px; width: auto;" @click="globalState.baseFontSize = 13" title="重置">重置</button>
    </div>
</div>
```

### 阶段 B: 编译验证

- [x] [Build] 在根目录执行 `npm run build` 命令。确保基于 Typescript 转换后的 Vue 运行时系统没有遭到破坏且能正常打包。

### 阶段 C: 文档更新

- [x] [Docs] 更新 `UPDATE_LOG.md`。为此次基础字号独立排版特性留档更新：
```markdown
### Visual & Layout Adjustments
- **Panel Settings**: 新增独立的基础字号 (Base Font Size) 系统，采用 CSS Variables 加 \`calc()\` 接管绝大部分面板内文本字号，有效分离于 UI Zoom 机制，支持持久化的局域化字号调整。
```
