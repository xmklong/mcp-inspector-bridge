declare global {
    interface Window {
        __MCP_DEBUG__?: boolean;
    }
}

export const Logger = {
    get isDebug(): boolean {
        return window.__MCP_DEBUG__ === true;
    },

    log(...args: any[]) {
        if (this.isDebug) {
            console.log(...args);
        }
    },

    debug(...args: any[]) {
        if (this.isDebug) {
            console.debug(...args);
        }
    },

    info(...args: any[]) {
        if (this.isDebug) {
            console.info(...args);
        }
    },

    warn(...args: any[]) {
        if (this.isDebug) {
            console.warn(...args);
        }
    },

    error(...args: any[]) {
        // 错误日志强制输出，不被 debug 开关屏蔽
        console.error(...args);
    }
};
