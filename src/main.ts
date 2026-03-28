'use strict';
declare const Editor: any;

/**
 * mcp-inspector-bridge: 主进程入口
 */
module.exports = {
    load() {
        Editor.log('[mcp-inspector-bridge] 主进程已启动，插件已加载。');
    },

    unload() {
        Editor.log('[mcp-inspector-bridge] 插件卸载。');
    },

    // 注册跨进程 IPC 消息侦听器
    messages: {
        'open'() {
            // 收到菜单指令，打开主面板
            Editor.Panel.open('mcp-inspector-bridge');
        },
        'ping-pong-test'(event: any, msg: string) {
            Editor.info('[mcp-inspector-bridge] 主进程收到来自 Webview / 面板的内容:', msg);
            // 这里可以回传数据给原发件人或做其他处理
        },
        'query-node-tree'(event: any) {
            // 目前已经通过 probe/crawler 脚本使用了 setInterval 自动轮询并通过
            // __mcpInspector.updateTree 自动推送。
            // 这里保留该接口为下阶段“按需主动拉取”做能力支持，当面板明确通知主进程强制刷新时，从此处处理。
            // 由于当前插件直接使用 <webview> 或前端控制的 BrowserView，主进程暂只作转发标记即可。
            Editor.info('[mcp-inspector-bridge] 面板请求强制刷新树节点 (下发执行指令...).');
            // 后续如有明确需求，此处可直接获取对应 webContents ID 执行 JS.
            if (event.reply) {
                event.reply(null, { status: "polling_active", msg: "已经由注入的爬虫自动同步数据" });
            }
        },
        'query-resolution'(event: any) {
            const profile = Editor.Profile.load('profile://project/mcp-inspector-bridge.json', 'mcp-inspector-bridge');
            const res = profile.get('last-resolution') || 'FIT';
            if (event.reply) {
                event.reply(null, res);
            }
        },
        'save-resolution'(event: any, value: string) {
            const profile = Editor.Profile.load('profile://project/mcp-inspector-bridge.json', 'mcp-inspector-bridge');
            profile.set('last-resolution', value);
            profile.save();
        },
        'query-fps'(event: any) {
            const profile = Editor.Profile.load('profile://project/mcp-inspector-bridge.json', 'mcp-inspector-bridge');
            const res = profile.get('show-fps');
            if (event.reply) {
                event.reply(null, res === undefined ? false : res);
            }
        },
        'save-fps'(event: any, value: boolean) {
            const profile = Editor.Profile.load('profile://project/mcp-inspector-bridge.json', 'mcp-inspector-bridge');
            profile.set('show-fps', value);
            profile.save();
        }
    },
};
