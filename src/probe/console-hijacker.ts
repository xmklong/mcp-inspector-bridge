export function initConsoleHijacker() {
    (window as any).__mcpRuntimeLogs = (window as any).__mcpRuntimeLogs || [];
    const MAX_LOG_LENGTH = 500;
    const MAX_STR_LEN = 300;

    const wrap = (type: string, originalFn: any) => {
        return function(...args: any[]) {
            if (originalFn) originalFn.apply(console, args);
            try {
                let msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                if (msg.length > MAX_STR_LEN) msg = msg.substring(0, MAX_STR_LEN) + '...(truncated)';
                (window as any).__mcpRuntimeLogs.push({ type, timestamp: Date.now(), message: msg });
                if ((window as any).__mcpRuntimeLogs.length > MAX_LOG_LENGTH) {
                    (window as any).__mcpRuntimeLogs.shift();
                }
            } catch (e) {}
        };
    };

    console.log = wrap('log', console.log);
    console.warn = wrap('warn', console.warn);
    console.error = wrap('error', console.error);
    if (typeof (window as any).cc !== 'undefined') {
        (window as any).cc.log = wrap('log', (window as any).cc.log);
        (window as any).cc.warn = wrap('warn', (window as any).cc.warn);
        (window as any).cc.error = wrap('error', (window as any).cc.error);
    }
}
