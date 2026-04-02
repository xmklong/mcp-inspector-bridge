# 性能分析面板总内存显示设计规范 (Spec)

## 1. 背景
用户在进行性能分析时，注意到现有的"资源内存排行"组件虽然列出了各项资源及按 Bundle 分组的明细数据，但缺乏一个全局视角的系统总内存汇总值。为便于快速评估游戏运行时的总体开销，需要在资源排行的头部增加总计内存显示。

## 2. 视觉需求 (Visual Requirements)

**改动前 (只有独立标题)：**
```text
+------------------------------------------------------+
| 资源内存排行                                         |
+------------------------------------------------------+
| 资源名称          | 类型      | 占用内存 ⬇  | 引用 |
| sprite-frame      | Sprite... | 1.25 MB     | 2    |
```

**改动后 (在同一栏的右侧并排展示统计数字)：**
```text
+------------------------------------------------------+
| 资源内存排行                   总计: 12.55 MB        |
+------------------------------------------------------+
| 资源名称          | 类型      | 占用内存 ⬇  | 引用 |
| sprite-frame      | Sprite... | 1.25 MB     | 2    |
```

## 3. 功能需求 (Functional Requirements)

### 3.1 根因分析
1. **探针未返回全量求和**：`__mcpGetMemoryRanking` 虽然归纳了所有资源，并在 `bundles` 数据结构里做了每个 Bundle 的分类求和 `currentMemory`，但在根节点并未累加返回一个 `totalMemory` 宏观字段。详情见 [memory.ts:L172](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/probe/memory.ts#L172)。
2. **面板视图未接通字段**：`index.html` 对应位置目前只单纯渲染标题，不具备双端布局（`justify-content: space-between`）来承接和显示总和数据。详情见 [index.html:L240](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L240)。

### 3.2 具体修复方案

**改动点一：探针端注入总内存计算**
在 `src/probe/memory.ts` 的最后排序输出阶段，进行循环累加，下发 `totalMemory` 给 `mcp-inspector-bridge` 控制台。
* 修复目标：[memory.ts:L174](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/probe/memory.ts#L174) 与 [memory.ts:L212](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/probe/memory.ts#L212)
```typescript
// 改动前
        const resultList = [];
        const allRes = [];

        for (let bName in bundleDataMap) {
            const block = bundleDataMap[bName];
            // ...

// 改动后
        const resultList = [];
        const allRes = [];
        let totalMem = 0;

        for (let bName in bundleDataMap) {
            const block = bundleDataMap[bName];
            totalMem += block.currentMemory;
            // ...
            
        // ... (在 return 时追加)
        return {
            totalMemory: totalMem,
            bundles: resultList,
            allResources: allRes
        };
```

**改动点二：DOM UI追加绑定**
修改 [index.html:L240](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L240) 的标题栏，使之转换为弹性盒，在其右侧渲染内存。
```html
<!-- 改动前 -->
<div style="background: #2a2a2a; padding: 6px 10px; font-weight: bold; font-size: calc(var(--base-font-size, 13px) - 1px); border-bottom: 1px solid #444; color: #e0e0e0;">
    资源内存排行
</div>

<!-- 改动后 -->
<div style="background: #2a2a2a; padding: 6px 10px; font-weight: bold; font-size: calc(var(--base-font-size, 13px) - 1px); border-bottom: 1px solid #444; color: #e0e0e0; display: flex; justify-content: space-between; align-items: center;">
    <span>资源内存排行</span>
    <span v-if="globalState.profiler?.memoryStats?.totalMemory !== undefined" style="color: #e57373;">
        总计: {{ formatBytes(globalState.profiler.memoryStats.totalMemory) }}
    </span>
</div>
```

### 3.3 现有机制复用说明
* **通信链路复用**：Vue 的 `globalState.profiler.memoryStats = data;` 触发器具备高层级隐式深代理能力，只要底层探针注入 `totalMemory` 属性，它随即具有响应性，我们不必要去干预 `useProfiler.ts` 的底层。
* **工具函子复用**：`index.ts` 已经提取并导出了 `formatBytes`，我们只要在花括号渲染域内复用它即可。

## 4. 边界情况 (Edge Cases)

1. **场景**：探针启动瞬间未读取到有效数值（未握手完成）。
   **风险**：`memoryStats` 可能是一个空数组或 undefined，导致 Vue 抛出读取 `totalMemory` of undefined。
   **缓解策略**：DOM 中使用 `v-if="globalState.profiler?.memoryStats?.totalMemory !== undefined"` 的断言链严格防御。
2. **场景**：用户未开启任何 Scene 或者处于严重内存卡顿无法传递数据时。
   **风险**：旧的内存由于未清空而可能造成画面欺瞒。
   **缓解策略**：（已由面板自身的加载状态挂起层机制全局兜底）。
3. **场景**：极窄面板拉伸测试。
   **风险**：增加了一个文本可能导致标题栏在一行拥挤断轴。
   **缓解策略**：使用 `flex` 与 `space-between` 能将字排布到两端边界，若宽度确实枯竭则会利用父级 `flex-direction: column` 规则向下接驳。
4. **场景**：数值在 0 的波谷状态。
   **风险**：若严格防御使用了隐式真假布尔 `v-if="globalState...totalMemory"` 会阻碍数字 `0` 的显示。
   **缓解策略**：在断言表达式中明确检测 `!== undefined`，而不是直接套用 `v-if` 的布尔转化机制。

## 5. 涉及文件清单

| 文件路径 | 改动类型 | 说明 |
|----------|----------|------|
| `src/probe/memory.ts` | 修改 | 追加对 Bundle 分区的内存变量求和并放入 Payload 对象。 |
| `src/panel/index.html` | 修改 | 在 DOM 标题头部嵌入一个总计 Flex span 并执行 formatBytes 函数解析响应。 |
