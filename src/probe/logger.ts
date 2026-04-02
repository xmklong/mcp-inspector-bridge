declare global {
    interface Window {
        __MCP_DEBUG__?: boolean;
    }
}

export const Logger = {
    get isDebug(): boolean {
        return true; // 临时为了调试商业项目大包围框问题强制打开
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
