# 性能分析面板总内存显示实施计划 (Plan)

## 1. 架构设计 (Architecture)

### 1.1 文件改动清单
| 涉及文件 | 所属层级 | 改动性质 | 说明 |
|----------|----------|----------|------|
| `src/probe/memory.ts` | `[Backend]` | 修改 | 拦截返回的字典并加上 `totalMemory` 以包含所有的 `bundles[i].currentMemory` 之和 |
| `src/panel/index.html` | `[Frontend]` | 修改 | 为内存排行榜表的标题头扩充 DOM Flex 属性，追加 `totalMemory` 渲染域 |

### 1.2 架构影响评估
> [!NOTE]
> 本次改动不涉及架构变更。只是探针向下推送的数据 Payload 结构平滑扩展，原有的通信流转和 Vue `reactive` 会自动全盘吸收这个新字段。

### 1.3 关键状态流转图
```mermaid
flowchart LR
    A[探针 memory.ts] -->|加总 bundles[?].currentMemory| B(追加 totalMemory 字段)
    B -->|__mcpGetMemoryRanking 全量回带| C[面板 useProfiler]
    C -->|Vue Proxy| D(globalState.profiler.memoryStats)
    D -->|更新| E[index.html 视图展现]
```

## 2. 分步实施 (Step-by-Step)

### 阶段 A: 底层探针数据增强
- [x] `[Backend]` 修改 `src/probe/memory.ts`：在末尾构造返回值时累加当前各个分卷的数据。
```typescript
// 改动前
        const resultList = [];
        const allRes = [];

        for (let bName in bundleDataMap) {
            const block = bundleDataMap[bName];
            // ... (原逻辑)

        return {
            bundles: resultList,
            allResources: allRes
        };

// 改动后
        const resultList = [];
        const allRes = [];
        let totalMem = 0; // 追加累加变量

        for (let bName in bundleDataMap) {
            const block = bundleDataMap[bName];
            totalMem += block.currentMemory; // 累加
            // ... (原逻辑)

        return {
            totalMemory: totalMem, // 注入返回
            bundles: resultList,
            allResources: allRes
        };
```

### 阶段 B: 前端面板视觉注入
- [x] `[Frontend]` 修改 `src/panel/index.html`：改造内存排行标签，支持 Flex 并将总计属性用 `formatBytes` 格式化绑定。
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

### 阶段 C: 编译验证
- [ ] `[Build]` 在项目根目录执行 `npm run build`，确保探针 Typescript 构建产物 `dist/probe.js` 同步刷新并不抛出任何类型异常。

### 阶段 D: 文档更新
- [ ] `[Docs]` 更新 `UPDATE_LOG.md`，在当前版本的变更小节中补录增加全局资源内存使用总量的日志。
