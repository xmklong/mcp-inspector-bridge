# 分辨率记忆保存功能 (Resolution Persistence)

## 背景
当前每次启动插件面板时，游戏预览区域的分辨率设置都会默认恢复到“自动充满 (Fit Window)”（或其他硬编码的默认值）。用户每次都需要手动切换到所需的分辨率并刷新，这在多项目开发中操作繁琐。我们需要引入存档功能，将其存储在使用环境的本地。

## 视觉需求 (Visual Requirements)
- 功能为纯逻辑层面的数据持久化支撑，无新增的 UI 元素。
- 复用现有的 `selectedResolution` 下拉菜单控件。
- 用户操作体验保持连贯：更改下拉框选项时即静默触发自动保存。

## 功能需求 (Functional Requirements)
1. **隔离与存储位置**:
   - 遵循多项目无冲突的原则，配置数据必须保存在当前工程级别的设置目录下（即 `settings/mcp-inspector-bridge.json`），而非全局环境。
   - 参考同系列插件的实现，需通过 Cocos Creator 提供的主进程 API: `Editor.Profile.load('profile://project/mcp-inspector-bridge.json', 'mcp-inspector-bridge')` 提取或存储配置。
2. **进程间通信 (IPC) 架构**:
   - **读取 / 初始化**：当渲染进程 (`src/panel/index.ts` 或者前端组件) 的 Vue 实例挂载完成后（`mounted` / `ready`），由渲染进程向主进程发送初始化配置的拉取请求，或由主进程在面板加载完毕时推送初始值。
   - **保存 / 更新**： Vue 侦听器 (Watcher) 监测 `selectedResolution` 的变更。一旦用户切换拉下菜单的值，渲染进程便通过 `Editor.Ipc.sendToMain('mcp-inspector-bridge:save-resolution', value)` 通知主进程。
   - **主进程逻辑** (`src/main.ts`)：主进程监听 `save-resolution` 的 IPC 消息，接收到 payload 之后，使用 `profile.set('last-resolution', value)` 跟随 `profile.save()` 完成实质上的落盘操作。

## 边缘情况 (Edge Cases)
1. **首次启用 / 无配置残留**: 用户首次在某项目中开启插件时，读取 `last-resolution` 会返回 `undefined` 或空值。在此情况下，系统必须安全回退 (Fallback) 并沿用内置的默认设定（如 `"FIT"`），绝不应引发 UI 层的绑定异常。
2. **废弃的旧脏数据**: 如果以往工程里设定了类似于 `"800x600"` 的分辨率，但当前新版本前端下拉项早已将该项剔除，在拉取到该无效值时前端需主动校验容错，将其覆盖重置为默认值 `"FIT"`。
3. **IPC 时序错开**: 考虑到 Vue 初始化速度与面板 DOM Ready 存在极短的时间差，如果采用主进程盲推机制可能漏接。因此应当采取「前端 `mounted` 后主动发起 IPC 轮询/拉取请求」的方式，以保障首次赋值的绝对可靠。
