# Widget 可视化检查器规格详细说明 (Spec)

## 1. 业务目标
解决在 Cocos Creator 2.4.x 环境下，对 `cc.Widget`（以及其他组件）的属性进行外部修改时，跨节点切换导致修改失效、以及撤销/重做系统报错（Unknown object to record）的核心持久化问题。

## 2. 视觉需求 (Visual Requirements)
- 组件列表头的 Enable/Disable 切换框需清晰可见，与组件名同行。
- 所有 `cc.Widget` 属性变动（如对齐开启/关闭、边距数值变化）在面板触发后，编辑器的主场景（Scene 视图）必须**即时视觉响应**。
- 不要求新增额外的 CV 识别工具，只需确保在属性调整后视图边距的正确缩放联动。

## 3. 功能需求 (Functional Requirements)

### 3.1 跨进程引擎数据修改
- 面板操作需要使用 `Editor.Scene.callSceneScript` 执行到 `scene-script.js` 内部。
- 必须基于 `compIndex` 绝对数组下标锁定目标组件对象，而非依赖可能会被混淆的类名（如 `Widget<cc.Widget>`）。
- 修改数值后，对于 `cc.Widget` 需要显式调用 `comp.updateAlignment()` 以确保引擎立即更新布局矩阵，解决视觉无响应问题。

### 3.2 编辑器数据环回同步与撤销支持 (持久化核心机制)
- **绝对禁止使用 Node UUID 拼接组件路径**：使用 `id: NodeUuid, path: "__comps__.1.xxx"` 试图修改组件属性会被编辑器的撤销（Undo）系统判定为不可识别对象，从而引发 `Unknown object to record` 的致命报错并阻断数据保存记录。
- **强制使用 Component UUID**：所有 Component 在 Cocos 内存中具有独立的 `uuid`。`runtime-crawler.js` 必须解锁并爬取组件自身的 `uuid` 字段。
- 面板通过 IPC 发送至主进程时，必须携带 `compUuid` 标识。
- 同步至 Editor 的 `scene:set-property` 指令必须修改为：
  ```javascript
  Editor.Ipc.sendToPanel('scene', 'scene:set-property', {
      id: compUuid, // 使用组件自身的 UUID
      path: key,    // 直接使用被修饰的公开属性名，如 "alignFlags", "top", "enabled"
      type: 'Float' | 'Boolean' | 'Enum',
      value: val,
      isSubProp: false
  });
  ```
- 上述调用必须被包裹在 `scene:undo-record` 和 `scene:undo-commit` 之中，用以确保该原子操作成为可查证的场景改动。

## 4. 边缘情况 (Edge Cases)
- **多组件相同名称**：依赖 `compIndex` 和 `compUuid` 双重保障，避免多个 `cc.Sprite` 等同名组件造成误操作。
- **隐藏或内部保护变量**：如 `_alignFlags` 不能直接暴露给 `scene:set-property`。必须在从 `scene-script.js` 回传的 payload 中将键名转换为受到 `@property` 装饰的公开形态（例如将 `_alignFlags` 转为 `alignFlags`）。
- **组件找不到 UUID 的降级**：若部分伪组件或内嵌组件缺失独立 UUID，则抛出显式跨步降级警告（使用 Node+偏移量兜底），但主要组件均确保含有。
