# 分辨率记忆保存功能实施计划 (Implementation Plan)

## 第一节：架构设计
本次功能开发涉及主进程和渲染进程（UI 面板）的联动，不涉及挂载在游戏窗口内的场景爬虫，数据将严格遵循进程隔离进行安全传递。
- **配置数据模型**: 借助 Cocos 官方提供的 `Editor.Profile` API，将设定以 JSON 的形式存储在当前工作工程的专用本地设置中 (`profile://project/mcp-inspector-bridge.json`)，避免在多个不同工程间产生交叉。
- **主进程 (`src/main.ts`)**:
  - 充当纯粹的设置托管者角色。
  - 新增 IPC 消息监听器 `mcp-inspector-bridge:query-resolution`，以便在收到前端查询请求时同步读取磁盘返回设定的初始值。
  - 新增 IPC 消息监听器 `mcp-inspector-bridge:save-resolution`，在用户下达修改时接收并立刻通过 `profile.save()` 落盘到硬盘。
- **渲染进程 (`src/panel/index.ts`)**:
  - 扮演主导视图与触发源角色。
  - 在 Vue `onMounted` 阶段或 `request` 阶段主动发送针对 `query-resolution` 的拉取通信。
  - 对负责双向绑定的 `selectedResolution` 建立响应式监视（Watcher），一有变动立即向外抛出 IPC 数据。
- **未波及文件**: 绝对无需修改 `src/scene-script.ts`（用于游戏场景的代理）和 `src/probe.ts` 爬虫注入模块。

## 第二节：步骤拆解
- [x] `[Main主进程]` 修改 `src/main.ts`，设计获取配置的辅助闭包或函数，基于 `Editor.Profile.load('profile://project/mcp-inspector-bridge.json', 'mcp-inspector-bridge')` 获取实例。
- [x] `[Main主进程]` 在 `src/main.ts` 的 `messages` 区域，补充注册 `'query-resolution'` 指令事件：读取 `last-resolution`。若不存在则采用默认值 `"FIT"` 回传给发送端。
- [x] `[Main主进程]` 在 `src/main.ts` 的 `messages` 区域，补充注册 `'save-resolution'` 指令事件：从载荷中提取新分辨率并执行 `profile.set('last-resolution', value)` 以及 `profile.save()` 进行存储。
- [x] `[UI面板]` 打开 `src/panel/index.ts`，在 Vue 3 的 `setup()` 生命周期初始化阶段，调用原生的异步 IPC `Editor.Ipc.sendToMain('mcp-inspector-bridge:query-resolution', (err, res) => { ... })` 拉取远端初始值覆盖 `selectedResolution.value`。
- [x] `[UI面板]` 继续于 `src/panel/index.ts` 补充数据流出功能，添加 `watch(selectedResolution, (newVal) => { Editor.Ipc.sendToMain('mcp-inspector-bridge:save-resolution', newVal) })` 实现操作和存储的连贯联动。
