// @ts-nocheck
import { Logger } from './logger';
import { initCrawler, syncNodeTree } from './crawler';
import { initHighlighter, startHighlighterHook } from './highlighter';
import { initProfiler } from './profiler';
import { initMemory } from './memory';
import { initRenderDebugger } from './render-debugger';
import { initPicker } from './picker';

(function () {
    // 幂等性防护：防止 webview 刷新后探针被重复注入导致定时器累积
    if (window.__mcpProbeInitialized) {
        return;
    }

    // 初始化全局模块暴露区
    initCrawler();
    initHighlighter();
    initProfiler();
    initMemory();
    initRenderDebugger();
    initPicker();

    const DEBUG_INTERVAL = 1000;

    function initProbe() {
        try {
            if (typeof cc === 'undefined' || !cc.director || !cc.director.getScene()) {
                setTimeout(initProbe, 500);
                return;
            }

            // 通知中控面板握手完成
            if (window.__mcpInspector && window.__mcpInspector.sendHandshake) {
                window.__mcpInspector.sendHandshake({
                    version: cc.ENGINE_VERSION,
                    isNative: cc.sys.isNative,
                    isMobile: cc.sys.isMobile,
                    language: cc.sys.language
                });
            }

            // 定期提取节点树 (可优化为脏检测机制，此处暂以 interval 替代)
            setInterval(syncNodeTree, DEBUG_INTERVAL);

            // 标记探针已初始化完成，防止重复注入
            window.__mcpProbeInitialized = true;

            // 启动高亮悬停侦听生命周期
            startHighlighterHook();

        } catch (err) {
            console.error('[Probe] 初始化探针发生致命异常:', err);
            const envData = {
                url: window.location.href,
                hasCC: typeof cc !== 'undefined',
                error: err.message || err.toString(),
                stack: err.stack
            };
            if (window.__mcpInspector && window.__mcpInspector.sendLog) {
                window.__mcpInspector.sendLog('[Probe Crash] ' + JSON.stringify(envData));
            }
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initProbe();
    } else {
        window.addEventListener('DOMContentLoaded', initProbe);
    }
})();
