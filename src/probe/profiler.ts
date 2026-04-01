// @ts-nocheck
export function initProfiler() {
    let lastFrames = window.cc.director.getTotalFrames();
    let lastTime = Date.now();
    let currentFps = 0;

    // 维护一个平滑窗口计算毫秒数
    let accumulatedLogicTime = 0;
    let accumulatedRenderTime = 0;
    let logicFrames = 0;
    let renderFrames = 0;

    let logicStart = 0;
    let renderStart = 0;

    // 实时逻辑消耗窃听器
    window.cc.director.on(window.cc.Director.EVENT_BEFORE_UPDATE, () => {
        logicStart = performance.now();
    });
    window.cc.director.on(window.cc.Director.EVENT_AFTER_UPDATE, () => {
        accumulatedLogicTime += (performance.now() - logicStart);
        logicFrames++;
    });

    // 实时渲染消耗窃听器
    window.cc.director.on(window.cc.Director.EVENT_BEFORE_DRAW, () => {
        renderStart = performance.now();
    });
    window.cc.director.on(window.cc.Director.EVENT_AFTER_DRAW, () => {
        accumulatedRenderTime += (performance.now() - renderStart);
        renderFrames++;
    });

    // 缓存给主进程轮询拿的变量
    let displayLogicTime = 0;
    let displayRenderTime = 0;

    setInterval(() => {
        const now = Date.now();
        const frames = window.cc.director.getTotalFrames();
        const dt = (now - lastTime) / 1000;
        if (dt > 0) {
            currentFps = Math.max(0, Math.round((frames - lastFrames) / dt));
        }
        lastTime = now;
        lastFrames = frames;

        // 平滑计算平均耗时，保留 2 位小数
        displayLogicTime = logicFrames > 0 ? Number((accumulatedLogicTime / logicFrames).toFixed(2)) : 0;
        displayRenderTime = renderFrames > 0 ? Number((accumulatedRenderTime / renderFrames).toFixed(2)) : 0;

        // 重置累加器
        accumulatedLogicTime = 0;
        logicFrames = 0;
        accumulatedRenderTime = 0;
        renderFrames = 0;

    }, 500); // 也是 500ms，和 FPS 一起刷新平滑

    window.__mcpProfilerTick = function () {
        // 读取 DrawCall: 它是单帧即时数据，可以直接拿 renderer 的
        let drawCall = 0;

        try {
            if (window.cc.renderer && typeof window.cc.renderer.drawCalls !== 'undefined') {
                drawCall = window.cc.renderer.drawCalls;
            } else if (window.cc.profiler_stats) {
                drawCall = window.cc.profiler_stats.drawCall || 0;
            }
        } catch (e) { }

        return {
            fps: currentFps,
            drawCall: drawCall,
            logicTime: displayLogicTime,
            renderTime: displayRenderTime
        };
    };
}
