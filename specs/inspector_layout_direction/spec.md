# Inspector 布局方向设置规范

## 4.1 背景
当前在插件中，“节点树 (Node Tree)”和“节点属性检查器 (Node Inspector)”强制以左右横向排布的方式呈现（默认使用 `flex-direction: row`）。然而，当用户的屏幕呈现窄屏应用场景或在移动显示器上将主面板垂直化后，当前的横屏布局容易导致拥挤。  
为了提高扩展性与操作自由度，亟需添加一个允许调整“纵向排布”以及“横向排布”选项。  
现有关键代码点：[index.html:L157](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L157) - 当前硬编码为 `flex-direction: row` 的地方。

## 4.2 视觉需求 (Visual Requirements)

```text
==============================================================
横向排布（当前默认）：

   [水平调整把手]           [偏好设置 - 布局方向]
        ↓                        [◉ 横向]  [○ 纵向]
+-----------------+ +----------------------------------------+
|                 |⋮|                                        |
|                 |⋮|                                        |
|    Node Tree    |⋮|           Node Inspector           |
|                 |⋮|                                        |
|                 |⋮|                                        |
+-----------------+ +----------------------------------------+

==============================================================
纵向排布（新增态）：

                            [偏好设置 - 布局方向]
                                 [○ 横向]  [◉ 纵向]
+------------------------------------------------------------+
|                                                            |
|                        Node Tree                         |
|                                                            |
+-------------------------- ⋯ -----------------------------+  ← [垂直调整把手]
|                                                            |
|                                                            |
|                      Node Inspector                    |
|                                                            |
|                                                            |
+------------------------------------------------------------+
```

## 4.3 功能需求 (Functional Requirements)

### 根因分析：
当前布局参数不可变的原因是核心的 Flexbox CSS 定义被直接硬编码在了 `index.html` 以及缺少可配置响应式的调整参数设计。
相关的行如下：
- [index.html:L157](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L157)：主容器绑定。
- [index.html:L158](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L158)：NodeTree的动态宽度锁定使用 `nodeTreePanelWidth`。
- [index.html:L163](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L163)：垂直切割热区 `class="resizer"`。
- [useLayout.ts:L44](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/composables/useLayout.ts#L44)：基于宽度 `mcp-inspector-nodetree-width` 的拖拽更新与 LocalStorage 持久化锁定。

### 具体修复方案：
1. **全局状态声明**
   在 `store.ts` 中维护新增的本地化排布布局模式枚举对象 `inspectorLayout`。
   ```typescript
   export const globalState = reactive({
       // ... 在 L27 uiScale 之后
       inspectorLayout: 'horizontal' as 'horizontal' | 'vertical',
   });
   ```

2. **UI布局与事件自适应**
   根据 `globalState.inspectorLayout` 的模式去渲染内部结构样式，使 `left`/`top`/`width`/`height` 指向分离解耦：
   ```html
   <!-- [index.html] CSS 新增纵向把手 -->
   .h-resizer { height: 6px; background: #333; cursor: row-resize; display: flex; justify-content: center; align-items: center; border-top: 1px solid #111; border-bottom: 1px solid #111; z-index: 100; }
   .h-resizer:hover { background: #4a4a4a; }
   .h-resizer::after { content: "⋯"; color: #888; font-size: 14px; }
   
   <!-- [index.html] Node Tree 主容器 -->
   <div :style="{ flex: 1, display: 'flex', flexDirection: globalState.inspectorLayout === 'vertical' ? 'column' : 'row', minHeight: 0 }">
       <div :style="{ 
           [globalState.inspectorLayout === 'vertical' ? 'height' : 'width']: globalState.inspectorLayout === 'vertical' ? nodeTreePanelHeight + 'px' : nodeTreePanelWidth + 'px', 
           flexShrink: 0, display: 'flex', flexDirection: 'column', overflowY: 'hidden', background: '#252525' }">
           <!-- NodeTree 占位 -->
       </div>
       <div :class="globalState.inspectorLayout === 'vertical' ? 'h-resizer' : 'resizer'" @mousedown="startNodeTreeDrag" title="拖拉调整尺寸"></div>
       <div style="flex: 1; overflow-y: hidden; background: #202020; min-width: 0; min-height: 0; position: relative;">
          <!-- Node Inspector 占位 -->
       </div>
   </div>
   ```

3. **设置项挂载：**
   在选项面板 [index.html:L314](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L314) 下方追加对应的横切复选状态区。

4. **处理 Composable 拖拽分离调整器：**
   `useLayout.ts` 必须隔离水平宽度 (`nodeTreePanelWidth`) 和垂直高度 (`nodeTreePanelHeight`)。在触发滑动行为时判断当前的布局排版模式以选取拖拉维度并记录到 localStorage 之中；当纵向发生拖转时应计算 `e.clientY - startY`。

### 现有机制复用说明：
- 复用了 `vue` `reactive` (`globalState`) 来传递给子级配置状态，实现改变布局瞬间全页面响应，免除编写无谓的 DOM query 流逻辑。
- 借用现有的 LocalStorage 持久化存储规范保存当前用户针对宽度、高度以及纵向排布的选择（不增加额外的 JS 通信桥梁调用）。
- 依然复用了原来的防遮挡拖放蒙层 `isNodeTreeDragging`。

## 4.4 涉及文件清单

| 文件路径 | 改动类型 | 说明 |
| :--- | :--- | :--- |
| [src/panel/store.ts](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/store.ts#L27) | 修改 | 添加 `inspectorLayout` 的反应状态。 |
| [src/panel/index.html](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L157) | 修改 | 更新 Flex 父容器和子级尺寸绑定，以及新增 CSS 类 `.h-resizer`。并在 "偏好设置" Tab 加入布局开关选项。 |
| [src/panel/composables/useLayout.ts](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/composables/useLayout.ts#L44) | 修改 | 新增 `nodeTreePanelHeight` 及拖动的高度处理流，以及对应方向的 localStorage 同步机制。 |
| [src/panel/index.ts](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.ts#L69) | 修改 | 引导载入期解析 `localStorage` 的 `inspectorLayout` 与高度值设置。 |

## 4.5 边界情况 (Edge Cases)

| 场景 | 风险分析 | 缓解策略 |
| :--- | :--- | :--- |
| **高度/宽度互相独立加载** | 用户在横向模式拖成小方块并转换为纵向，可能会因为高度记录缺乏被赋值为横向状态（极少宽），反方向过短。 | 在 `useLayout.ts` 中维护两个互不干涉的状态值：`nodeTreePanelWidth`（横式）和 `nodeTreePanelHeight`（直式）。 |
| **容器向下压缩极限溢出** | `Inspector` 因为 `Tree` 拖拽得过高而失去滚动的显示区域，从而内容丢失或排版断裂。 | `useLayout.ts` 需计算外部包裹父元素的最大可用高度 `wrapContextHeight`，将其 `maxLimit` 设定为总高扣除 `150px` 的最小保障量。并且添加 `min-height: 0;` 给其余盒子结构。 |
| **调整时失去鼠标捕捉焦点** | 在进行拖拽调整过程中，如果鼠标滑出 webview 等其它区域可能会由于失去 up/move 事件而卡在拖拽死循环。 | 继续复用现阶段针对全局施加的 `<div v-show="isNodeTreeDragging" style="position: absolute; inset: 0; z-index: 99;"></div>` 覆盖全区，保护接收焦点。 |
| **初次渲染没数据闪烁情况** | 初次读盘未识别用户模式会导致视图有视觉回退或二次伸缩的情况。 | 在 `index.ts` 尽早在 vue instance setup 前抽取同步完成本地缓存挂载，确保启动时渲染方向正确。 |

