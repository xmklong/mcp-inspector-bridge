# 渲染诊断面板响应式 UI 实施计划 (Plan)

## 3.1 架构设计 (Architecture)

### 文件清单表格

| 文件名 | 所属层级 | 改动性质 | 一句话说明 |
|---|---|---|---|
| `src/panel/components/RenderDebugger.ts` | [Frontend] | 修改 | 为顶部标题、数据表格和三栏容器引入响应式流体力学属性（`flex-wrap`、`min-width`）。 |
| `UPDATE_LOG.md` | [Docs] | 修改 | 追加本次三栏适配调整的改动至更新日志。 |

> [!NOTE]
> 架构影响评估：本次改动**不涉及任何底层架构变更**、状态管理调整或重新投递 IPC 消息。它仅仅是对 Vue 组件模板内的 CSS `style` 进行原生的盒模型和多行弹性适配打补丁。

### 关键流程图

```mermaid
graph TD;
    A[外部容器尺寸缩小] --> B{遭遇窄屏断点?}
    B -- 否: 宽屏 --> C[渲染区保持 25% | 50% | 25% 同行平行展开]
    B -- 是: 总宽 < 720px --> D[单元素触发 flex-basis 下限]
    D --> E[排版自然分行 wrap]
    E --> F[变为 左(上) - 中(中) - 右(下) 三行堆叠]
    E --> G[父级通过 overflow-y: auto 提供原生滚动保护]
```

## 3.2 分步实施 (Step-by-Step)

### 阶段 A: 代码修改

- [x] [Frontend] **修复顶部标题区的空间压榨**。修改 `src/panel/components/RenderDebugger.ts` 第 8 行，追加换行与自动补位：
```html
<!-- 改动前 -->
<div style="flex-shrink: 0; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
    <div>
<!-- 中间的按钮组 -->
    <div style="display: flex; gap: 10px;">
```
```html
<!-- 改动后 -->
<div style="flex-shrink: 0; margin-bottom: 10px; display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
    <div style="flex: 1 1 300px;">
<!-- 中间的按钮组 -->
    <div style="display: flex; gap: 10px; flex-wrap: wrap; flex: 1 1 auto; justify-content: flex-end;">
```

- [x] [Frontend] **修复重绘画布在冻结状态下被严重挤成细条的问题**。修改 `src/panel/components/RenderDebugger.ts` 第 73-125 行左右：
```html
<!-- 改动前 -->
<div v-if="isFrozen && frozenSnapshot" style="flex: 1; min-height: 0; display: flex; gap: 10px; overflow: hidden; margin-top: 5px;">
    <div style="width: 25%; background: #1a1a1c; border: 1px solid #333; border-radius: 4px; display: flex; flex-direction: column; overflow: hidden;">
    ...
    <div style="width: 50%; background: #000; border: 1px solid #333; border-radius: 4px; display: flex; flex-direction: column; overflow: hidden;">
    ...
    <div style="width: 25%; background: #1a1a1c; border: 1px solid #333; border-radius: 4px; display: flex; flex-direction: column; overflow: hidden;">
```
```html
<!-- 改动后 -->
<div v-if="isFrozen && frozenSnapshot" style="flex: 1; min-height: 0; display: flex; flex-wrap: wrap; gap: 10px; overflow-y: auto; overflow-x: hidden; margin-top: 5px; align-content: flex-start;">
    <div style="flex: 1 1 200px; min-height: 250px; background: #1a1a1c; border: 1px solid #333; border-radius: 4px; display: flex; flex-direction: column; overflow: hidden;">
    ...
    <div style="flex: 2 1 300px; min-height: 300px; background: #000; border: 1px solid #333; border-radius: 4px; display: flex; flex-direction: column; overflow: hidden;">
    ...
    <div style="flex: 1 1 200px; min-height: 250px; background: #1a1a1c; border: 1px solid #333; border-radius: 4px; display: flex; flex-direction: column; overflow: hidden;">
```

- [x] [Frontend] **为主控列表加上底线宽度保护**。修改 `src/panel/components/RenderDebugger.ts` 非冻结状态下表格（约 34 行），增加 `min-width`：
```html
<!-- 改动前 -->
<table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
<!-- 改动后 -->
<table style="width: 100%; min-width: 500px; border-collapse: collapse; font-size: 12px; text-align: left;">
```

### 阶段 B: 编译验证

- [x] [Build] 运行 `npm run build` 以清理 Typescript 构建，生成最新的静态资源并确保没有句法报错。
- [x] [Build] 手动激活游戏预览进入"诊断面板"页面，调整插件视窗宽度大小，拖拽 `rightPanelWidth` 验证布局是否在空间紧缺时健康地进行弹性堆叠，且三栏和表格文字没有产生无法辨认的挤兑。

### 阶段 C: 文档更新

- [x] [Docs] 更新根目录中的 `UPDATE_LOG.md`，添加有关“Render Pipeline 流水线诊断面板：响应式流体视图折行补丁”的里程碑记录。
