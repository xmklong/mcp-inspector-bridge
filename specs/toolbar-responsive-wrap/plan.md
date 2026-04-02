# 实施计划 — 顶部操作栏响应式自动换行

## 架构设计 (Architecture)

### 文件清单

| 文件 | 所属层级 | 改动性质 | 说明 |
|------|---------|---------|------|
| `src/panel/index.html` | Frontend | 修改 | 修改 `<style>` CSS 规则 + 操作栏容器行内样式 + 子元素语义类名 |
| `UPDATE_LOG.md` | Docs | 修改 | 添加 0.0.9 版本的响应式工具栏优化条目 |

### 架构影响评估

> [!NOTE]
> 本次改动**不涉及架构变更**。
> - 不新增 TypeScript 文件
> - 不修改 `useLayout.ts` 等 composable 逻辑
> - 不新增 state 变量
> - 完全复用现有的 `globalState.isNarrow`（阈值 500px）和 `.narrow-mode` CSS 级联机制

### 复用的现有机制

| 已有机制 | 位置 | 本次用途 |
|---------|------|---------|
| `globalState.isNarrow` | `store.ts:12` | 作为窄模式判断依据，驱动 padding 切换 |
| `.narrow-mode` CSS 类 | `index.html:76` | 通过 CSS 级联控制子元素的 `order` 和 `width` |
| `ResizeObserver` 防抖 | `useLayout.ts:117-137` | 保证 `isNarrow` 切换平滑无抖动 |

---

## 分步实施 (Step-by-Step)

### 阶段 A: CSS 样式修改

- [x] [Frontend] **A1. 新增 `.resolution-select` 基础保护样式**

  在 `<style>` 区域（约第 17 行附近）新增最小宽度保护规则：

  ```css
  /* 改动前（第 17 行）: */
  .narrow-mode .resolution-select { max-width: 100px; }

  /* 改动后: */
  .resolution-select { min-width: 120px; box-sizing: border-box; }
  .narrow-mode .resolution-select { max-width: none; width: 100%; order: 10; }
  ```

- [x] [Frontend] **A2. 新增窄模式下子元素 `order` 重排规则**

  紧接上方规则，添加：

  ```css
  .narrow-mode .toolbar-rotate-btn { order: 2; }
  .narrow-mode .toolbar-spacer { order: 3; flex-basis: 0; }
  .narrow-mode .toolbar-brand { order: 4; }
  ```

### 阶段 B: HTML 模板修改

- [x] [Frontend] **B1. 修改操作栏容器为自适应高度 + 允许换行**

  ```html
  <!-- 改动前（第 78 行）: -->
  <div style="height: 35px; background: #3c3c3c; display: flex; align-items: center; padding: 0 10px; gap: 5px; overflow: hidden;">

  <!-- 改动后: -->
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

- [x] [Frontend] **B2. 给横竖屏按钮添加语义类名**

  ```html
  <!-- 改动前（第 95 行）: -->
  <button class="icon-btn" title="横竖屏切换" @click="rotateScreen">🔄</button>

  <!-- 改动后: -->
  <button class="icon-btn toolbar-rotate-btn" title="横竖屏切换" @click="rotateScreen">🔄</button>
  ```

- [x] [Frontend] **B3. 给弹性占位 div 添加语义类名**

  ```html
  <!-- 改动前（第 96 行）: -->
  <div style="flex: 1; min-width: 0;"></div>

  <!-- 改动后: -->
  <div class="toolbar-spacer" style="flex: 1; min-width: 0;"></div>
  ```

- [x] [Frontend] **B4. 给 MCP Bridge 标识添加语义类名**

  ```html
  <!-- 改动前（第 97 行）: -->
  <div class="truncate-text" style="font-size: 12px; color: #aaa; flex-shrink: 2;" :style="globalState.isNarrow ? { fontSize: '10px' } : {}">MCP Bridge</div>

  <!-- 改动后: -->
  <div class="truncate-text toolbar-brand" style="font-size: 12px; color: #aaa; flex-shrink: 2;" :style="globalState.isNarrow ? { fontSize: '10px' } : {}">MCP Bridge</div>
  ```

### 阶段 C: 编译验证

- [x] [Build] **C1. 执行 `npm run build` 确认编译通过**

### 阶段 D: 文档更新

- [x] [Docs] **D1. 更新 `UPDATE_LOG.md`**

  在 `## [0.0.8]` 之前插入新版本条目：

  ```markdown
  ## [0.0.9] - 2026-04-02

  ### 🐛 缺陷修复

  - **修复极窄面板下分辨率选择框不可读 (Toolbar Responsive Wrap)**
    - **问题**：操作栏固定 `height: 35px` + `overflow: hidden`，极窄时分辨率 `<select>` 被压扁到 0px
    - **方案**：`min-height` + `flex-wrap: wrap` 自动折行 + `min-width: 120px` 保护 + CSS `order` 重排窄模式元素布局

  ---
  ```
