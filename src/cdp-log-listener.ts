/**
 * 运行时日志监听器 (Runtime Log Listener)
 * 
 * 采用 Hybrid 策略：
 *   1. 主进程尝试注册 console-message 事件（对 BrowserView 类型有效）
 *   2. 对 <webview> 类型：通过 executeJavaScript 注入捕获脚本到页面内部，
 *      拦截 console.* 写入 window.__mcpLogBuffer，查询时轮询读取
 * 
 * 为什么需要注入？
 *   Electron <webview> 运行在独立渲染进程中，其 console 输出不会触发
 *   主进程的 console-message 事件，也不会派发 CDP Runtime 事件。
 *   唯一可靠的方式是在页面进程内部拦截。
 */
declare const Editor: any;

/** 单条日志条目 */
export interface CdpLogEntry {
    type: string;          // "log" | "warn" | "error"
    timestamp: number;
    message: string;
    args: any[];
    url?: string;
    line?: number;
    column?: number;
}

const MAX_BUFFER = 500;
const MAX_MSG_LEN = 300;

let buffer: CdpLogEntry[] = [];
let targetWC: any = null;
let listening = false;
let _useInjection = false; // ★ 是否使用了注入模式（webview 场景）
let _eventCount = 0;

/** 将日志条目推入 RingBuffer（自动截断到 MAX_BUFFER 上限） */
function push(e: CdpLogEntry): void {
    _eventCount++;
    buffer.push(e);
    if (buffer.length > MAX_BUFFER) buffer.shift();
}

/**
 * 要注入到 webview 页面内的 JS 代码（IIFE）
 *
 * 原理：包装 console.log/warn/error，每次调用时将副本写入 window.__mcpLogBuffer。
 * 原始行为完全不变（originalFn.apply(console, args)），零视觉影响。
 * 来源追踪通过 Error.stack 解析获取（仅用于内部存储，不注入输出文本）。
 */
const INJECTION_SCRIPT = `
//# sourceURL=mcp-log-capture.js
(function(){
    if (window.__mcpLogInjected) return;
    window.__mcpLogInjected = true;
    window.__mcpLogBuffer = [];
    var MAX = 1000;
    
    function parseCaller() {
        try { throw new Error('_'); } catch(e) {
            var lines = e.stack.split('\\n');
            // 调用栈: [0]=Error, [1]=parseCaller, [2]=capture, [3~N]=console包装层/真实调用者
            for (var i = 3; i < Math.min(lines.length, 16); i++) {
                var m = lines[i].match(/\\((.+?):(\\d+):(\\d+)\\)/);
                if (!m) m = lines[i].match(/at\\s+(.+?):(\\d+):(\\d+)/);
                if (m && !m[1].includes('mcp-log-capture')) return { url: m[1], line: parseInt(m[2]), col: parseInt(m[3]) };
            }
        }
        return null;
    }
    
    function capture(type, args) {
        try {
            var caller = parseCaller();
            var msg = Array.prototype.slice.call(args).map(function(a) {
                if (typeof a === 'object') try { return JSON.stringify(a); } catch(e) {}
                return String(a);
            }).join(' ');
            if (msg.length > 2000) msg = msg.slice(0, 2000) + '...(截断长日志)';
            var entry = {
                t: type === 'warning' ? 'warn' : type,
                ts: Date.now(),
                m: msg,
                u: caller ? caller.url : undefined,
                l: caller ? caller.line : undefined,
                c: caller ? caller.col : undefined
            };
            window.__mcpLogBuffer.push(entry);
            if (window.__mcpLogBuffer.length > MAX) window.__mcpLogBuffer.shift();
        } catch(_) {}
    }

    function createProxy(orig, k) {
        return new Proxy(orig, {
            apply: function(target, thisArg, argumentsList) {
                if (window.__mcpLogRecursionGuard) {
                    return Reflect.apply(target, thisArg, argumentsList);
                }
                window.__mcpLogRecursionGuard = true;
                capture(k, argumentsList);
                var ret = Reflect.apply(target, thisArg, argumentsList);
                window.__mcpLogRecursionGuard = false;
                return ret;
            }
        });
    }
    
    var methods = ['log', 'warn', 'error', 'info', 'debug'];
    methods.forEach(function(k) {
        if (console[k]) {
            console[k] = createProxy(console[k], k);
        }
    });

    // 侵入式劫持 cc API，支持稍后加载的 cc
    var hijackCc = function() {
        if (window.cc && !window.__mcpCcHijacked) {
            window.__mcpCcHijacked = true;
            ['log', 'warn', 'error'].forEach(function(k) {
                if (window.cc[k]) {
                    window.cc[k] = createProxy(window.cc[k], k);
                }
            });
            console.log('[MCP] cc 对象引擎日志通道劫持已完成');
        }
    };
    
    // 立即尝试，未就绪时轮询
    hijackCc();
    if (!window.__mcpCcHijacked) {
        var timer = setInterval(function() {
            hijackCc();
            if (window.__mcpCcHijacked) clearInterval(timer);
        }, 500);
        // 10秒后停止轮询，防止非 cocos 环境死循环
        setTimeout(function() { clearInterval(timer); }, 10000);
    }
    
    console.log('[MCP] 日志捕获已启用');
})();
`;

/**
 * 初始化日志监听器（幂等 — 重复调用安全）
 */
export async function initCdpLogListener(silent = false): Promise<boolean> {
    if (listening && targetWC && !targetWC.isDestroyed()) return true;
    if (listening && (!targetWC || targetWC.isDestroyed?.())) {
        listening = false;
        targetWC = null;
        _useInjection = false;
    }

    try {
        const { webContents } = require('electron');
        const all = webContents.getAllWebContents();

        const urls = all.map((w: any) => ({
            url: w.getURL(),
            id: w.id,
            type: w.getType?.(),
            destroyed: w.isDestroyed?.(),
        }));
        if (!silent) Editor.log(`[CDP Log] 扫描到 ${all.length} 个 WebContents: ${JSON.stringify(urls)}`);

        // 查找预览游戏页面
        const game = all.find((w: any) => {
            const u = w.getURL();
            if (!u || w.isDestroyed?.()) return false;
            if (u.includes('inspector') || u.startsWith('chrome-extension') || u === 'about:blank') return false;
            return /https?:\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/i.test(u);
        });

        if (!game) {
            if (!silent) Editor.log('[CDP Log] 未找到匹配的预览页面 WebContents');
            return false;
        }

        if (!silent) Editor.log(`[CDP Log] ✓ 找到目标: id=${game.id} type=${game.getType?.()} url=${game.getURL().slice(0, 120)}`);
        targetWC = game;

        const wcType = game.getType?.() || 'unknown';

        if (wcType === 'webview') {
            // ★ Webview 模式：注入捕获脚本 + 轮询读取
            _useInjection = true;
            
            if (!silent) Editor.log('[CDP Log] 检测到 webview 类型，使用注入式日志捕获...');
            
            await game.executeJavaScript(INJECTION_SCRIPT);
            
            // 验证注入是否生效
            await new Promise<void>((resolve) => setTimeout(resolve, 200));
            
            const testResult: any = await game.executeJavaScript(`
                JSON.stringify({
                    injected: !!window.__mcpLogInjected,
                    bufferSize: window.__mcpLogBuffer ? window.__mcpLogBuffer.length : -1,
                    firstEntry: (window.__mcpLogBuffer && window.__mcpLogBuffer.length > 0) 
                        ? window.__mcpLogBuffer[0] : null
                })
            `);
            
            if (!silent) Editor.log(`[CDP Log] 注入验证结果: ${testResult}`);
            
        } else {
            // ★ 非 Webview 模式：使用原生 console-message 事件
            _useInjection = false;
            game.on('console-message', (_ev: any, level: number, message: string, line: number, sourceId: string) => {
                push({
                    type: level === 1 ? 'warn' : (level >= 2 ? 'error' : 'log'),
                    timestamp: Date.now(),
                    message: message.slice(0, MAX_MSG_LEN),
                    args: [],
                    url: sourceId || undefined,
                    line: line || undefined,
                    column: undefined,
                });
            });
        }

        game.once('destroyed', () => {
            Editor.log('[CDP Log] 目标 WebContents 已销毁');
            listening = false;
            targetWC = null;
            _useInjection = false;
        });

        listening = true;
        if (!silent) Editor.log(`[CDP Log] ✓ 初始化完成 (mode=${_useInjection ? 'injection' : 'native-event'})`);
        return true;
    } catch (e: any) {
        listening = false;
        targetWC = null;
        _useInjection = false;
        if (!silent) Editor.error('[CDP Log] initCdpLogListener 失败:', e.message || e);
        return false;
    }
}

/**
 * 获取缓存日志（支持 tail 截断和 level 过滤）
 * 
 * @param tail - 最多返回的条目数（默认 50，上限 100）
 * @param level - 过滤级别: "all" | "warn" | "error"
 */
export async function getCdpLogs(tail = 50, level = 'all'): Promise<CdpLogEntry[]> {
    // 如果是注入模式，先从 webview 轮询最新数据
    if (_useInjection && targetWC && !targetWC.isDestroyed?.()) {
        try {
            const raw: any = await targetWC.executeJavaScript(`
                (function() {
                    if (!window.__mcpLogBuffer) return [];
                    var data = window.__mcpLogBuffer.slice();
                    window.__mcpLogBuffer = [];
                    return data;
                })()
            `);
            if (Array.isArray(raw)) {
                for (const entry of raw) {
                    push({
                        type: entry.t || 'log',
                        timestamp: entry.ts || Date.now(),
                        message: entry.m || '',
                        args: [],
                        url: entry.u,
                        line: entry.l,
                        column: entry.c,
                    });
                }
            }
        } catch (_) {
            // 轮询失败时返回已有缓存
        }
    }

    let r = buffer;

    if (level === 'error') {
        r = r.filter(e => e.type === 'error');
    } else if (level === 'warn') {
        r = r.filter(e => e.type === 'warn' || e.type === 'error');
    }

    return r.slice(-Math.min(tail, 100));
}

/** 获取当前连接状态和缓冲区大小 */
export function getCdpStatus(): { attached: boolean; size: number; method: string; eventCount: number; injection: boolean } {
    return { 
        attached: listening, 
        size: buffer.length, 
        method: _useInjection ? 'webview-injection' : 'native-event', 
        eventCount: _eventCount,
        injection: _useInjection 
    };
}

/** 断开并清空 */
export function detachCdpListener(): void {
    targetWC = null;
    listening = false;
    _useInjection = false;
    buffer = [];
}
