# Inspector 布局方向设置实施计划

## 3.1 架构设计 (Architecture)

### 文件清单表格

| 文件名 | 所属层级 | 改动性质 | 说明 |
| :--- | :--- | :--- | :--- |
| `src/panel/store.ts` | `[Frontend]` | 修改 | 增加全局状态 `inspectorLayout` 用于管控面板排列方向。 |
| `src/panel/index.html` | `[Frontend]` | 修改 | 替换硬编码的 `flex-direction: row` 为状态绑定；添加垂直切割拉柄；在设置页加选项。 |
| `src/panel/composables/useLayout.ts` | `[Frontend]` | 修改 | 扩展布局管理逻辑以囊括纵向高度控制和纵向的拖曳动作。 |
| `src/panel/index.ts` | `[Frontend]` | 修改 | 增加初始数据拉取逻辑将此设置与 LocalStorage 双向挂钩。 |
| `UPDATE_LOG.md` | `[Docs]` | 修改 | 编写相关功能的发布说明。 |

> [!NOTE]
> 本次改动不涉及架构变更，仅扩展了原有 Vue 的 Layout 系统以及 LocalStorage 配置项，确保横纵布局平滑切换。

## 3.2 分步实施 (Step-by-Step)

### 阶段 A: 代码修改

- [x] `[Frontend]` **修改状态管理库**：在 `src/panel/store.ts` 中加入 `inspectorLayout` 全局状态。
  ```typescript
  // 改动前：
  previewPort: 7456 as number,
  uiScale: 1.0 as number
  });

  // 改动后：
  previewPort: 7456 as number,
  uiScale: 1.0 as number,
  inspectorLayout: 'horizontal' as 'horizontal' | 'vertical'
  });
  ```

- [x] `[Frontend]` **增加纵向布局控制逻辑**：在 `src/panel/composables/useLayout.ts` 引入 `nodeTreePanelHeight` 及拖拽控制。
  ```typescript
  // 新增高度控制
  const nodeTreePanelHeight = ref(250);
  try {
      const savedH = window.localStorage.getItem('mcp-inspector-nodetree-height');
      if (savedH) {
          const hNum = parseInt(savedH, 10);
          if (!isNaN(hNum) && hNum >= 100) nodeTreePanelHeight.value = hNum;
      }
  } catch(e) {}
  
  // 改造拖拽判定逻辑
  const startNodeTreeDrag = (downEvent: MouseEvent) => {
      // ... 若 globalState.inspectorLayout === 'vertical'，使用 clientY 计算高度变动
      // 否则沿用目前基于 clientX 计算宽度变动
  };
  ```

- [x] `[Frontend]` **UI 视图渲染改造**：在 `src/panel/index.html` 更新排布结构与加设切换按钮。
  ```html
  <!-- 改动前的主容器 -->
  <div style="flex: 1; display: flex; flex-direction: row; min-height: 0;">
      <div :style="{ width: nodeTreePanelWidth + 'px', flexShrink: 0, display: 'flex', flexDirection: 'column', overflowY: 'hidden', background: '#252525' }">
      
  <!-- 改动后的主容器 -->
  <div :style="{ flex: 1, display: 'flex', flexDirection: globalState.inspectorLayout === 'vertical' ? 'column' : 'row', minHeight: 0 }">
      <div :style="{ 
          [globalState.inspectorLayout === 'vertical' ? 'height' : 'width']: globalState.inspectorLayout === 'vertical' ? nodeTreePanelHeight + 'px' : nodeTreePanelWidth + 'px', 
          flexShrink: 0, display: 'flex', flexDirection: 'column', overflowY: 'hidden', background: '#252525' }">
  ```
  *同时需要在“偏好设置”底部添加按钮，并补齐 `<style>` `.h-resizer`。*

- [x] `[Frontend]` **入口初始化同步**：在 `src/panel/index.ts` 的启动阶段加载设置。
  ```typescript
  const savedLayout = window.localStorage.getItem('mcp-inspector-layout');
  if (savedLayout === 'vertical' || savedLayout === 'horizontal') {
      globalState.inspectorLayout = savedLayout;
  }
  
  watch(() => globalState.inspectorLayout, (newVal) => {
      window.localStorage.setItem('mcp-inspector-layout', newVal);
  });
  ```

### 阶段 B: 编译验证

- [x] `[Build]` **执行编译**：在终端运行 `npm run build` 确保所有 TypeScript 代码顺利转换为正确的发行版结构并通过校验无静态类型报错。

### 阶段 C: 文档更新

- [x] `[Docs]` **日志归档**：更新 `UPDATE_LOG.md` 的新增内容区，描述此界面功能改进特性。

