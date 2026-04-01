const { watch } = require('vue');

export function useProfiler(globalState: any, gameView: any, activeTab: any) {
    let profilerTickTimer: any = null;
    let memoryRankTimer: any = null;

    const setupProfilerWatchers = () => {
        watch(activeTab, (newVal: number) => {
            const wv: any = gameView.value;
            if (newVal === 4 && wv) {
                if (!profilerTickTimer) {
                    profilerTickTimer = setInterval(() => {
                        const expr = `window.__mcpProfilerTick ? JSON.stringify(window.__mcpProfilerTick()) : null`;
                        wv.executeJavaScript(expr).then((res: string) => {
                            if (res) {
                                try {
                                    const data = JSON.parse(res);
                                    Object.assign(globalState.profiler.tick, data);
                                } catch (e) { }
                            }
                        }).catch(() => { });
                    }, 150);
                }

                if (!memoryRankTimer) {
                    let uuidNameCache: Record<string, string> = {};

                    memoryRankTimer = setInterval(() => {
                        const expr = `window.__mcpGetMemoryRanking ? JSON.stringify(window.__mcpGetMemoryRanking()) : null`;
                        wv.executeJavaScript(expr).then((res: string) => {
                            if (res) {
                                try {
                                    const data = JSON.parse(res);
                                    const EditorContext = (window as any).Editor;

                                    const resolveRealName = (item: any) => {
                                        if (uuidNameCache[item.id]) {
                                            item.name = uuidNameCache[item.id];
                                            return;
                                        }
                                        const remoteDb = EditorContext && EditorContext.assetdb && EditorContext.assetdb.remote;
                                        if (remoteDb && typeof remoteDb.uuidToUrl === 'function') {
                                            const url = remoteDb.uuidToUrl(item.id);
                                            if (url && typeof url === 'string') {
                                                let cleanUrl = url.replace('db://assets/', '');
                                                cleanUrl = cleanUrl.replace('db://internal/', '[Internal] ');
                                                item.name = cleanUrl;
                                                uuidNameCache[item.id] = item.name;
                                                return;
                                            }
                                        }
                                        uuidNameCache[item.id] = item.name;
                                    };

                                    if (data.allResources) data.allResources.forEach(resolveRealName);

                                    if (data.bundles) {
                                        const oldBundles = globalState.profiler.memoryStats && globalState.profiler.memoryStats.bundles;
                                        const oldMemMap: Record<string, number> = {};
                                        if (oldBundles) {
                                            oldBundles.forEach((ob: any) => {
                                                oldMemMap[ob.name] = ob.currentMemory;
                                            });
                                        }

                                        data.bundles.forEach((b: any) => {
                                            if (b.resources) b.resources.forEach(resolveRealName);
                                            const oldMem = oldMemMap[b.name];
                                            if (oldMem !== undefined) {
                                                if (b.currentMemory > oldMem) b.trend = 'up';
                                                else if (b.currentMemory < oldMem) b.trend = 'down';
                                                else b.trend = 'flat';
                                            } else {
                                                b.trend = 'flat';
                                            }
                                        });

                                        data.bundles.sort((a: any, b: any) => b.currentMemory - a.currentMemory);
                                    }

                                    globalState.profiler.memoryStats = data;
                                } catch (e) { }
                            }
                        }).catch(() => { });
                    }, 1000);
                }
            } else {
                if (profilerTickTimer) {
                    clearInterval(profilerTickTimer);
                    profilerTickTimer = null;
                }
                if (memoryRankTimer) {
                    clearInterval(memoryRankTimer);
                    memoryRankTimer = null;
                }
            }
        });
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return {
        setupProfilerWatchers,
        formatBytes
    };
}
