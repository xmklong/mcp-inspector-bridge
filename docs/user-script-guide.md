# 用户脚本扩展系统 — 使用文档

## 概述

mcp-inspector-bridge 内置了类油猴（Greasemonkey/Tampermonkey）的用户脚本扩展系统。你可以编写 `.user.js` 脚本，在编辑器面板中挂载运行，实现自动化测试、游戏数据采集、自定义 MCP 工具等能力。

脚本运行在编辑器面板的渲染进程（非游戏 webview），但可以通过 `@grant` 声明的权限去操作游戏内对象。

---

## 快速开始

### 1. 打开脚本管理面板

在 mcp-inspector-bridge 面板中切换到 **Tab 3（用户脚本）**，点击 **"+ 新建"**。

### 2. 编写第一个脚本

编辑器会自动填入模板。**注意文件头中的 `@grant` 声明——用到了哪个 API，就必须声明对应的权限**：

```js
// ==McpScript==
// @name        我的第一个脚本
// @version     1.0.0
// @description 每 2 秒点击一次屏幕中央
// @author      YourName
// @grant       input_simulation   ← mcp.input.click() 需要这个
// @grant       persistent         ← mcp.setInterval() 需要这个
// ==/McpScript==

let count = 0;

// persistent 提供的定时器，停用脚本时会自动清理
mcp.setInterval(() => {
    count++;
    // input_simulation 提供的点击能力
    mcp.input.click(540, 960);
    mcp.log(`第 ${count} 次点击`);
}, 2000);
```

> **关键规则**：`@grant` 声明必须与你使用的 API 一一对应。未声明的 API 在 `mcp` 对象上为 `undefined`，调用会报错。

### 3. 保存并运行

输入文件名（如 `my-test`），点击**保存**。脚本会立即启用，状态变为 **"运行中"**。

---

## 脚本文件格式

### 元数据块 `// ==McpScript==`

每个脚本文件**必须**以元数据块开头，格式与油猴脚本兼容：

```js
// ==McpScript==
// @name        脚本名称        ← 必填
// @version     1.0.0           ← 可选，默认 0.0.0
// @description 一段描述          ← 可选
// @author      作者名           ← 可选
// @grant       input_simulation ← 可多次声明
// @grant       mcp_tool
// ==/McpScript==

// 以下为脚本执行体
mcp.log('脚本启动');
```

### 元数据字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `@name` | **是** | 脚本显示名称，在管理面板中展示 |
| `@version` | 否 | 语义化版本号，默认 `0.0.0` |
| `@description` | 否 | 脚本功能描述 |
| `@author` | 否 | 作者名 |
| `@grant` | 否 | 声明所需权限，可重复声明多个 |

### 完整元数据头（所有权限声明）

以下是包含**全部 5 个可选 `@grant`** 的完整文件头，作为编写复杂脚本时的参考：

```js
// ==McpScript==
// @name        全能脚本
// @version     1.0.0
// @description 使用了全部 5 个 @grant 权限的完整示例
// @author      YourName
// @grant       input_simulation   ← 解锁 mcp.input.* 方法
// @grant       cc_api             ← 解锁 mcp.runInGame() 方法
// @grant       persistent         ← 解锁 mcp.setInterval/setTimeout 方法
// @grant       mcp_tool           ← 解锁 mcp.registerTool() 方法
// @grant       game_state         ← 预留权限（当前版本未实现 API）
// ==/McpScript==
```

> 实际编写时**只需声明你用到的权限**，不需要全部写上。`@name` 是唯一必填项。

### 权限 → API 速查表

| `@grant` 声明 | 解锁的 `mcp.*` API |
|---------------|--------------------|
| _(无需声明)_ | `mcp.log()` `mcp.warn()` `mcp.error()` |
| `input_simulation` | `mcp.input.click()` `mcp.input.doubleClick()` `mcp.input.longPress()` `mcp.input.swipe()` `mcp.input.clickNode()` |
| `cc_api` | `mcp.runInGame(fn)` |
| `persistent` | `mcp.setInterval()` `mcp.setTimeout()` `mcp.clearInterval()` |
| `mcp_tool` | `mcp.registerTool(toolDef)` |
| `game_state` | _(预留，暂无 API)_ |

### 文件存储

脚本保存为 `*.user.js` 文件，存放在当前 Cocos Creator 项目的 `extensions/` 目录下。启用状态持久化在项目的 `mcp-scripts.json` profile 中。

---

## 权限系统 `@grant`

脚本默认**无任何特权**，仅可调用 `mcp.log/warn/error` 三个日志方法。其他能力需要通过 `@grant` **显式声明**：

```js
// @grant       input_simulation
// @grant       cc_api
// @grant       mcp_tool
// @grant       persistent
```

| 权限名 | 解锁能力 | 风险等级 |
|--------|---------|----------|
| `input_simulation` | 模拟游戏内触摸/点击/滑动操作 | 中 |
| `cc_api` | 在游戏 webview 中执行任意 JS 代码 | **高** |
| `game_state` | （预留）访问游戏运行时状态 | 中 |
| `mcp_tool` | 动态注册自定义 MCP 工具供 AI 调用 | **高** |
| `persistent` | 使用 `setInterval`/`setTimeout` 实现持久任务 | 低 |

---

## API 参考

### 基础 API（无需 grant）

所有脚本均可使用：

#### `mcp.log(...args)`
输出日志到编辑器 Console 面板。

```js
mcp.log('当前状态:', someVar);
```

#### `mcp.warn(...args)`
输出警告到编辑器 Console 面板。

```js
mcp.warn('配置项缺失，使用默认值');
```

#### `mcp.error(...args)`
输出错误到编辑器 Console 面板。**不会中断脚本执行**。

```js
try {
    riskyOperation();
} catch (e) {
    mcp.error('操作失败:', e.message);
}
```

---

### `input_simulation` 权限

需要声明：`// @grant input_simulation`

用于在游戏预览窗口中模拟触屏操作。底层通过 webview 的 `executeJavaScript` 注入 `__mcpCrawler.simulateInput()` 调用。

#### `mcp.input.click(x, y)`
在屏幕坐标 `(x, y)` 处执行一次点击。

```js
// 点击按钮中心位置
mcp.input.click(500, 300);
```

#### `mcp.input.doubleClick(x, y)`
在屏幕坐标 `(x, y)` 处执行双击（两次点击间隔 100ms）。

```js
mcp.input.doubleClick(500, 300);
```

#### `mcp.input.longPress(x, y, duration?)`
在屏幕坐标 `(x, y)` 处长按。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `x` | number | 是 | 屏幕 X 坐标 |
| `y` | number | 是 | 屏幕 Y 坐标 |
| `duration` | number | 否 | 长按持续时间 ms，默认 500 |

```js
// 长按 1 秒
mcp.input.longPress(500, 300, 1000);
```

#### `mcp.input.swipe(x1, y1, x2, y2)`
从 `(x1, y1)` 滑动到 `(x2, y2)`。

```js
// 从右下往左上滑动（模拟翻页）
mcp.input.swipe(800, 900, 200, 100);
```

#### `mcp.input.clickNode(uuid)`
点击场景中指定 UUID 的节点。

```js
// 先通过节点树查到的 UUID 直接点击
mcp.input.clickNode('a1b2c3d4-...');
```

---

### `cc_api` 权限

需要声明：`// @grant cc_api`

#### `mcp.runInGame(fn): Promise<any>`
在游戏 webview 的 JS 上下文中执行函数，返回 Promise 携带执行结果。

| 限制 | 说明 |
|------|------|
| 超时 | 5 秒，超时返回 `{ error: 'runInGame timeout (5s)' }` |
| 序列化 | 返回值通过 `JSON.stringify` 序列化传递，不支持函数/循环引用 |
| 上下文 | 函数在游戏全局作用域执行，可访问 `cc`、`window` 等引擎对象 |

```js
// 获取当前场景名称
const result = await mcp.runInGame(() => {
    const scene = cc.director.getScene();
    return scene ? scene.name : 'no scene';
});
mcp.log('当前场景:', result);

// 获取节点数量
const nodeCount = await mcp.runInGame(() => {
    return cc.director.getScene().children.length;
});
mcp.log('根节点数:', nodeCount);

// 获取玩家坐标
const playerPos = await mcp.runInGame(() => {
    const player = cc.find('Canvas/Player');
    if (!player) return null;
    return { x: player.x, y: player.y };
});
```

---

### `persistent` 权限

需要声明：`// @grant persistent`

提供持久化的定时器能力。与标准 `setInterval`/`setTimeout` 的区别：这些定时器在脚本被停用时**自动清理**，不会泄漏。

#### `mcp.setInterval(fn, ms): number`
创建持久间隔定时器。最小间隔 100ms。

```js
// 每 2 秒输出 FPS（需要配合 cc_api）
mcp.setInterval(async () => {
    const stats = await mcp.runInGame(() => {
        return { fps: cc.game.getFrameRate() };
    });
    mcp.log('FPS:', stats.fps);
}, 2000);
```

#### `mcp.clearInterval(id)`
清除指定的间隔定时器。

```js
const timerId = mcp.setInterval(() => {
    mcp.log('tick');
}, 1000);

// 5 秒后停止
mcp.setTimeout(() => {
    mcp.clearInterval(timerId);
    mcp.log('定时器已清除');
}, 5000);
```

#### `mcp.setTimeout(fn, ms): number`
创建持久延迟定时器。执行后自动注销。

```js
mcp.setTimeout(() => {
    mcp.log('3 秒后执行');
}, 3000);
```

---

### `mcp_tool` 权限

需要声明：`// @grant mcp_tool`

动态注册自定义 MCP 工具，供 AI（Claude Code 等）通过 MCP 协议调用。

#### `mcp.registerTool(toolDef)`
注册一个 MCP 工具。如果同名工具已存在，会覆盖并警告。

```js
mcp.registerTool({
    name: 'my_custom_tool',
    description: '自定义工具的描述——AI 会根据这段描述决定何时调用',
    inputSchema: {
        type: 'object',
        properties: {
            param1: { type: 'string', description: '参数说明' }
        },
        required: ['param1']
    },
    handler: async (args) => {
        // 工具的执s行逻辑
        return { result: 'success', param: args.param1 };
    }
});
```

`toolDef` 结构：

```ts
interface ToolDef {
    name: string;            // 工具唯一名（对 AI 暴露）
    description: string;     // 功能描述（AI 根据此判断何时调用）
    inputSchema: {           // JSON Schema 格式参数定义
        type: 'object';
        properties: Record<string, { type: string; description: string }>;
        required?: string[];
    };
    handler: (args: any) => Promise<any>;  // 工具执行函数
}
```

**注意**：`handler` 目前通过面板存储，实际被 AI MCP 调用时需要由 `script-register-tool` IPC 通道转发。当前版本 `handler` 在内存中暂存，后续版本将完善端到端执行链路。

---

### `game_state` 权限

需要声明：`// @grant game_state`

**状态**：预留权限，当前版本尚未实现具体 API。未来将提供游戏运行时状态的读写能力。

---

## 脚本生命周期

```
安装/启用
    │
    ▼
解析元数据块 → 验证 @name 存在 → 解析 @grant 权限
    │
    ▼
构建 mcp API（仅注入声明过的 grant 对应方法）
    │
    ▼
执行脚本体 (new Function('mcp', bodyCode))
    │
    ├── 成功 → 状态: "运行中"
    │
    └── 抛出异常 → 状态: "错误"，显示错误信息
    │
    ▼
停用: 清除所有 setInterval/setTimeout → 注销所有 MCP 工具 → 状态 "已停用"
    │
    ▼
启用: 重新读取文件 → 重新解析 → 重新执行
    │
    ▼
删除: 停用 + 删除磁盘文件 + 清理 profile 记录
```

---

## 完整示例

### 示例 1：自动连点器

```js
// ==McpScript==
// @name        自动连点器
// @version     1.0.0
// @description 每 3 秒点击屏幕中央
// @grant       input_simulation
// @grant       persistent
// ==/McpScript==

let count = 0;

mcp.setInterval(() => {
    count++;
    mcp.input.click(540, 960);
    mcp.log(`第 ${count} 次点击`);
}, 3000);
```

### 示例 2：游戏数据采集器

```js
// ==McpScript==
// @name        场景节点采集器
// @version     1.0.0
// @description 定时采集场景中的节点统计信息
// @grant       cc_api
// @grant       persistent
// ==/McpScript==

mcp.setInterval(async () => {
    const stats = await mcp.runInGame(() => {
        const scene = cc.director.getScene();
        if (!scene) return { error: '场景未加载' };

        // 递归统计所有节点
        function countNodes(node) {
            let count = 1;
            node.children.forEach(c => count += countNodes(c));
            return count;
        }

        return {
            sceneName: scene.name,
            totalNodes: countNodes(scene),
            fps: 1 / cc.director.getDeltaTime(),
        };
    });

    if (!stats.error) {
        mcp.log(`[${stats.sceneName}] 节点: ${stats.totalNodes}, FPS: ${stats.fps}`);
    }
}, 5000);
```

### 示例 3：自定义 AI MCP 工具

```js
// ==McpScript==
// @name        游戏天气控制工具
// @version     1.0.0
// @description 为 AI 提供控制游戏中天气的能力
// @grant       mcp_tool
// @grant       cc_api
// ==/McpScript==

mcp.registerTool({
    name: 'set_game_weather',
    description: '设置游戏中的天气。参数 weather 支持: sunny, rainy, snowy',
    inputSchema: {
        type: 'object',
        properties: {
            weather: {
                type: 'string',
                description: '天气类型: sunny | rainy | snowy',
                enum: ['sunny', 'rainy', 'snowy']
            }
        },
        required: ['weather']
    },
    handler: async (args) => {
        const result = await mcp.runInGame(() => {
            // 假设游戏中有一个 WeatherManager 组件
            const weatherNode = cc.find('Canvas/WeatherManager');
            if (!weatherNode) return { error: 'WeatherManager 节点未找到' };

            const weatherComp = weatherNode.getComponent('WeatherManager');
            if (!weatherComp) return { error: 'WeatherManager 组件未找到' };

            weatherComp.setWeather(args.weather);
            return { success: true, weather: args.weather };
        });
        return result;
    }
});

mcp.log('天气控制工具已注册');
```

---

## AI MCP 工具参考

以下工具通过 MCP 协议暴露给 AI，AI 可远程管理脚本：

| 工具名 | 参数 | 说明 |
|--------|------|------|
| `install_script` | `name` (文件名), `code` (完整脚本内容) | 安装或更新一个脚本，立即启用 |
| `enable_script` | `name` (文件名) | 启用一个已停用的脚本 |
| `disable_script` | `name` (文件名) | 停用一个正在运行的脚本 |
| `list_scripts` | 无 | 列出所有已安装脚本及状态 |

**注意**：AI **不能**删除脚本，只有用户可以通过面板手动删除。这是安全设计。

---

## 面板管理操作

| 按钮 | 说明 |
|------|------|
| **+ 新建** | 从模板创建新脚本 |
| **导入** | 从本地文件系统导入 `.user.js` 文件 |
| **启用/停用** | 切换脚本运行状态（停用会清除定时器和 MCP 工具） |
| **编辑** | 在语法高亮编辑器中修改脚本 |
| **导出** | 导出脚本到本地文件系统 |
| **删除** | 删除脚本文件并清理 profile 状态 |

### 状态指示灯

| 颜色 | 状态 | 说明 |
|------|------|------|
| 🟢 绿色 | 运行中 | 脚本正常执行 |
| 🟠 橙色 | 已停用 | 脚本已安装但未运行 |
| 🔴 红色 | 错误 | 脚本执行时抛出异常，下方显示错误信息 |

---

## 常见错误

### ❌ 调用了未声明的 API

```js
// ==McpScript==
// @name        错误示例
// @grant       input_simulation
// ==/McpScript==

// ❌ 错误：mcp.setInterval 需要 @grant persistent
mcp.setInterval(() => {
    mcp.input.click(500, 300);
}, 1000);
```

**症状**：`TypeError: mcp.setInterval is not a function`
**原因**：使用了 `persistent` 权限提供的 API 但未在文件头声明 `// @grant persistent`
**修复**：在元数据块中添加 `// @grant persistent`

### ❌ @name 为空

**症状**：保存时无反应，Console 中显示 `[Script] @name 为必填字段`
**原因**：`// @name` 行后面没有填写名称或整行被删除
**修复**：确保 `// @name` 后面有非空白文本

---

## 调试技巧

1. **查看日志**：所有 `mcp.log/warn/error` 输出到 Cocos Creator 的 Console 面板
2. **错误提示**：脚本出错时管理面板会显示红色错误信息条
3. **编辑再保存**：修改后保存会自动重新加载脚本（等效于停用→启用）
4. **权限检查**：在脚本开头 log 一下 `mcp` 对象确认 API 是否可用：`mcp.log(Object.keys(mcp))`
5. **@name 必填**：保存前如果 @name 为空，会阻止保存并给出警告
