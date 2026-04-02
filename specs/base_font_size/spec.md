# 基础字号设置需求规范 (Spec)

## 4.1 背景
当前插件界面的所有字号均为硬编码定值（如 `13px` 或 `12px`）。虽然提供了 `uiScale`（UI 缩放比例）用于整体缩放，但这会连同按钮、间距、图标等一起缩放。[用户反馈](index.html)插件整体字号偏大，希望能在受控的基准上进行整体增减。此方案通过引入 CSS 自定义变量 `--base-font-size`，并基于 `calc()` 函数在各处动态计算字号，从而允许用户在设置面版微调基础字体大小。此举需修改持久化状态。相关持久化参考 [store.ts:L3](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/store.ts#L3)。

## 4.2 视觉需求 (Visual Requirements)

在原有的 "偏好设置" 页面，于 "UI 界面缩放比例" 和 "检查器排布方向" 之间新增一个 "基础字号 (Base Font Size)" 选项块。

```text
改动前：
[偏好设置面板]
UI 界面缩放比例 (UI Scale)
[-------O--------] 100% [重置]

检查器排布方向 (Inspector Layout)
(o) 横向并排 (左右)  ( ) 纵向并排 (上下)

=============================================

改动后：
[偏好设置面板]
UI 界面缩放比例 (UI Scale)
如果面板在低分辨率屏幕下显示拥挤，可调低此比例。
[-------O--------] 100% [重置]

基础字号 (Base Font Size)
作为全局排版基准值 (修改后将立即在本地缓存)。
[-------O--------] 13px [重置]

检查器排布方向 (Inspector Layout)
控制左侧节点树和右侧属性面板的排列方式。
(o) 横向并排 (左右)  ( ) 纵向并排 (上下)
```

## 4.3 功能需求 (Functional Requirements)

### 根因分析
- **字号硬编码**：核心入口文件 [index.html:L4](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L4) 等多处统一定义了 `13px`、`12px` 等具体数值，无法动态调整。
- **缺乏响应变量**：状态管理文件 [store.ts:L27](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/store.ts#L27) 中存在 `uiScale` 但无用于字号排版的属性。

### 具体修复方案

#### 1. 状态管理扩充
目标文件与行号：[store.ts:L27](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/store.ts#L27)
为全局状态对象增加持久化的字号属性。
```diff
     isNodePickerActive: false as boolean,
     previewPort: 7456 as number,
     uiScale: 1.0 as number,
+    baseFontSize: 13 as number,
     inspectorLayout: 'horizontal' as 'horizontal' | 'vertical'
```

#### 2. 生命周期持久化与注入
目标文件与行号：[index.ts:L72](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.ts#L72)
负责读取缓存并监听属性变化，利用 DOM 操作写入全局 CSS 变量。
```diff
                 const savedScale = window.localStorage.getItem('mcp-ui-scale');
                 if (savedScale && !isNaN(parseFloat(savedScale))) {
                     globalState.uiScale = parseFloat(savedScale);
                 }
+                const savedFontSize = window.localStorage.getItem('mcp-base-font-size');
+                if (savedFontSize && !isNaN(parseInt(savedFontSize))) {
+                    globalState.baseFontSize = parseInt(savedFontSize, 10);
+                }
                 const savedLayout = window.localStorage.getItem('mcp-inspector-layout');

                 watch(() => globalState.inspectorLayout, (newVal: string) => {
                     try {
                         window.localStorage.setItem('mcp-inspector-layout', newVal);
                     } catch(e) {}
                 });
+
+                watch(() => globalState.baseFontSize, (newVal: number) => {
+                    try {
+                        if (panelAppElement) {
+                            panelAppElement.style.setProperty('--base-font-size', \`\${newVal}px\`);
+                        }
+                        window.localStorage.setItem('mcp-base-font-size', newVal.toString());
+                    } catch(e) {}
+                });

                 watch(() => globalState.uiScale, (newVal: number) => {
```
*同理要在 `onMounted` 里赋初值。*

#### 3. 页面样式引入变量计算
目标文件与行号：[index.html:L4](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L4)
将所有的字号转化为相对 `--base-font-size` 的 `calc()` 方程式。
```diff
- .tab-nav { display: flex; background: #1e1e1e; border-bottom: 1px solid #000; font-size: 13px; }
+ .tab-nav { display: flex; background: #1e1e1e; border-bottom: 1px solid #000; font-size: var(--base-font-size, 13px); }

- .tree-content { flex: 1; overflow-y: auto; font-family: monospace; font-size: 12px; padding: 5px 0; }
+ .tree-content { flex: 1; overflow-y: auto; font-family: monospace; font-size: calc(var(--base-font-size, 13px) - 1px); padding: 5px 0; }
```
所有原 `13px` 变为 `var(--base-font-size, 13px)`。
原 `12px` 变为 `calc(var(--base-font-size, 13px) - 1px)`。
原 `14px` 变为 `calc(var(--base-font-size, 13px) + 1px)`。
原 `10px` 变为 `calc(var(--base-font-size, 13px) - 3px)`。

#### 4. UI 界面设置区新增控件
目标文件与行号：[index.html:L330](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L330)
```diff
+ <div style="margin-bottom: 20px; background: #252525; padding: 12px; border-radius: 4px; border: 1px solid #333;">
+     <div style="font-size: var(--base-font-size, 13px); font-weight: bold; margin-bottom: 8px;">基础字号 (Base Font Size)</div>
+     <div style="font-size: calc(var(--base-font-size, 13px) - 1px); color: #aaa; margin-bottom: 10px;">作为全局排版基准值 (修改后将立即在本地缓存)。</div>
+     <div style="display: flex; gap: 10px; align-items: center;">
+         <input type="range" v-model.number="globalState.baseFontSize" min="11" max="18" step="1" style="width: 200px;">
+         <span style="font-family: monospace; font-size: var(--base-font-size, 13px); background: #111; padding: 3px 6px; border-radius: 3px; min-width: 40px; text-align: center;">{{ globalState.baseFontSize }}px</span>
+         <button class="icon-btn" style="padding: 2px 8px; width: auto;" @click="globalState.baseFontSize = 13" title="重置">重置</button>
+     </div>
+ </div>
```


### 现有机制复用说明
- 复用了 `vue` 的 `watch` 监听器机制和浏览器的 `window.localStorage` 持久化接口（类似 uiScale 处理方式）。
- 复用了 `#app` 根容器作为底层 CSS variable (`--base-font-size`) 的挂载点以便所有子元素继承。
- 复用了 `index.html` 现有的 UI 缩放比例控件 `<input type="range">` 的相关模板结构与内联样式，避免新增独立 CSS 类。

## 4.4 涉及文件清单

| 文件路径 | 改动类型 | 说明 |
|----------|----------|------|
| `src/panel/store.ts` | 修改 | 新增 `baseFontSize: 13` 初始化声明 |
| `src/panel/index.ts` | 修改 | 添加关于 `baseFontSize` 的 localstorage 存取以及同步至 `#app` style 属性的逻辑 |
| `src/panel/index.html` | 修改 | 绝对 px 替换为基准值计算样式；增加设置面板 slider 控件 |

## 4.5 边界情况 (Edge Cases)

1. **场景**：用户设定基础字号过大导致溢出（比如设定大于 24px）。
   - **风险**：文本溢出原本写死的固定高度按钮（如 26px）或与图标发生严重重叠，破坏结构。
   - **缓解策略**：在 slider 中实施极值硬限制，设置 `min="11" max="18"`。
2. **场景**：基准字号设置得太小（极端情况达到 11px）。
   - **风险**：通过 `calc(var(--base-font-size) - 3px)` 衍生的极小文本可能触发 `8px` 极小值，存在兼容性不可读甚至渲染崩坏。
   - **缓解策略**：主流环境对小于 9px 的支持有容错，可暂时忽略此类轻微溢出风险，但严控 base size 不得低于 11px 的下限。
3. **场景**：组件还未注入样式之前（FOUT）。
   - **风险**：初始化一瞬间的 CSS 没有注入变量属性导致文本闪烁跳跃。
   - **缓解策略**：强制要求所有的样式规则都自带回退容错：使用 `var(--base-font-size, 13px)` 而不是光写 `var(--base-font-size)`。
4. **场景**：基础字号缩放和全局 UI Scale 同时变化引起的双倍缩放效应。
   - **风险**：两者的叠加可能引发未知的坐标系统错乱，尤其是对包含内部自适应组件的嵌套模块。
   - **缓解策略**：UI Scale 操作于 `zoom` 物理伸缩，而字体计算仅靠 `font-size`，确保两者运算上相互独立互不干扰。我们只需明确告诉用户它是一个额外字号补偿即可。
