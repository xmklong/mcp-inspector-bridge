# 更新日志 (Update Log)

本项目记录 `mcp-inspector-bridge` 的重大里程碑、架构变更与缺陷修复记录。

## [0.0.1] - 2026-03-27

### ✨ 新特性与架构变更
- **运行时节点树 (Runtime Node Tree)**:
  - 实现类似 Unity 的场景节点实时监察面板。通过插入爬虫预加载器（`runtime-crawler.js`），每秒以 JSON 序列化形式通过 IPC 推送最新的节点树结构。
  - **动态组件图标与染色支持**：增加预制体 (Prefab) 以及深层级解构支持，深度渲染不同的文本颜色以反映潜逃等级（深蓝、海蓝、紫粉等），根 Scene 节点使用专属 🌐 图标。
  - **搜索与定位增强**：新增树状结构的名称过滤（包含高亮），并在一键清除搜索时能够准确留存路径祖先（`ancestorIds`），防止列表暴力重折叠。
- **节点属性审查器 (Node Inspector)**：
  - **装饰器属性精准映射**：深入剖析并打通了 Cocos 2.4 原生 `@property` 注册机制。优先遍历 `__props__` 及内置 `hiddenBuiltins` 黑名单过滤 `_objFlags` 等字段，并通过读取 `__attrs__.visible` 以及检查私有下划线前缀确保暴露层的绝对安全。
  - **基础与数组类型的跨域处理**：实现 `string`, `number`, `boolean` 的双端响应式挂载及编辑；完成对 `Array` 类型的降级只读序列化（防回环卡死），并实现了特殊资源 `[cc.Prefab]` 等格式的名字提取及可视化罗列展示。
  - **内置隔离的控制台 Debug 日志浮窗**：在 `runtime-crawler` 前端引入静默工作制，在控制面板上加装 Checkbox 开关。开启后即可在画面左上角挂载半透绿色骇客级防刷屏输出台，实时打出 `__attrs__` 序列诊断日记，用完即关。
- **彻底抛弃 Webview 挂载模式 (原生架构跃升)**：
  - 由于 Cocos 插件基于旧版 Chromium 内核，`<webview>` 的默认 `about:blank` 导航锁死了 `webContents.setDevToolsWebContents()`。
  - 采用了更为稳定的底层 `BrowserView` 原生框架层方案。
  - 完成了双分栏视图：游戏画面为 Webview，DevTools 为上层悬浮绝对定位的 `BrowserView` 映射。
- **完善的视图占位引擎**：监听 `resize` 事件与 `getBoundingClientRect()`，实时同步 `BrowserView` 尺寸至左侧 Vue 面板内的伪占位 `<div ref="devtoolsView">`。

### 🐛 缺陷修复
- **修复 DOM Tree 初始化黑屏问题**：根源在于 `<webview>` DOM 生命周期紊乱，切至 `BrowserView` 后彻底解决"有壳无树"的 `DevTools` 连接问题，使 CDP 前端完全捕获目标页面的结构树。
- **捕获并压制 `cc.Scene` Getter 崩溃**：
  - **症状**：Cocos 2.4 当 `node instanceof cc.Scene` 时，任何对其 `node.active` 的求值均会触发内部警告日志不断刷屏。
  - **修复策略**：在探针代码 `src/probe.ts` 与主面板 `src/panel/index.ts` 中加入双重预检防御。如果是引擎 `cc.Scene` 类型对象，直接设置其标识位为 `true`，切断危险属性嗅探，保证 Console 日志清洁无乱码。
- **修复游戏预览区域不可控的滚动条问题**：
  - **症状**：在部分特殊的分辨率模拟模式下（例如 iPhone X / Android 1080p），或者拖动窗口缩放导致产生浮点比例时，预览区会不自主地爆出原生水平或垂直的滚动轴，且可以直接干预游戏画面中心点。
  - **修复策略**：重构了 `gameContainerStyle` 取回基于 `Math.floor()` 的亚像素下取整安全宽度保障；在面板 `index.html` 层级全面增加 `overflow: hidden;`；并且利用 `insertCSS` 对 `webview` 生命周期发起了跨域样式篡写，深度摧毁隐藏了原生的 `body` 以及 Cocos 测试壳底层的 `.contentWrap` 自动溢出属性与 Webkit 控制杆。

---

## [0.0.1-alpha] - 2026-03-26

### ✨ 早期探索历程
- **挂载首测**：测试单栏到双栏的 UI 改造。
- **抢占式探测机制**：通过 Vue 3 引入 20ms 微秒级轮询池 `setInterval` 用于捕获 Webview ID。
- **预加载流建立**：撰写 `preload.ts` 将 IPC 和通信能力安全地注入到 Cocos 原生 `gameWV` 窗口。

### 🐞 遗留问题
- DevTools 会渲染出一个没有 DOM Tree、网络连接状态的死实例（现已全力攻破）。
