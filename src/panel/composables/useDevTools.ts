const { nextTick, onUnmounted } = require('vue');
let remote: any = null;
try {
    const electron = require('electron');
    // 如果环境自带或者被注入了 electron.remote 则使用，否则回退尝试获取独立垫片包
    remote = electron.remote || require('@electron/remote');
} catch (e) {
    if (typeof Editor !== 'undefined') {
        Editor.warn('[Bridge] electron remote module 获取失败，DevTools 特性受限', e);
    } else {
        console.warn('Failed to load electron remote module', e);
    }
}
declare const Editor: any;

export function useDevTools(globalState: any, gameView: any, devtoolsView: any, activeTab: any, rightPanelWidth: any) {
    const BrowserView = remote ? remote.BrowserView : null;
    let devToolsBV: any = null;
    let isDevToolsSetup = false;
    let wasExternalDevToolsOpened = false;
    let externalDevToolsWinId: number | null = null;

    const updateBrowserViewBounds = () => {
        if (!devToolsBV) return;
        const container = devtoolsView.value as any;
        if (!container) return;
        
        const rect = container.getBoundingClientRect();
        let targetX = rect.left;
        let targetY = rect.top;
        let targetWidth = rect.width;
        let targetHeight = rect.height;

        // 【核心修正】由于当前项目借助 CSS `zoom` 实现面板缩放，
        // 在 Chromium 59 中，如果元素有 zoom（或者处于有 zoom 的容器内），
        // 它的 getBoundingClientRect() 所返回的是 **逆向缩放后的 CSS 虚幻绝对坐标**。
        // 即：真正的物理尺寸 = rect.X * zoom。
        if (globalState.uiScale && globalState.uiScale !== 1) {
            targetX = rect.left * globalState.uiScale;
            targetY = rect.top * globalState.uiScale;
            targetWidth = rect.width * globalState.uiScale;
            targetHeight = rect.height * globalState.uiScale;
        }

        try {
            devToolsBV.setBounds({
                x: Math.round(targetX),
                y: Math.round(targetY),
                width: Math.round(targetWidth),
                height: Math.round(targetHeight)
            });
        } catch (e) { }
    };

    const setupDevToolsWatchers = () => {
        const { watch } = require('vue');
        watch(rightPanelWidth, () => {
            if (activeTab.value === 1 && devToolsBV) {
                updateBrowserViewBounds();
            }
        });
        
        watch(activeTab, async (newVal: number) => {
            if (newVal === 1 && !isDevToolsSetup) {
                await nextTick();
                let attempts = 0;
                const captureInterval = setInterval(() => {
                    attempts++;
                    if (isDevToolsSetup) {
                        clearInterval(captureInterval);
                        return;
                    }
                    if (attempts > 150) {
                        clearInterval(captureInterval);
                        globalState.devToolsError = 'BrowserView: 游戏 WebContents 获取超时';
                        return;
                    }

                    try {
                        const gameWV: any = gameView.value;
                        if (!gameWV) return;
                        const gid = gameWV.getWebContentsId();
                        if (!gid) return;

                        clearInterval(captureInterval);
                        const gWC = remote.webContents.fromId(gid);
                        if (!gWC) {
                            globalState.devToolsError = '游戏 WebContents fromId 失败';
                            return;
                        }

                        const currentWindow = remote.getCurrentWindow();
                        devToolsBV = new BrowserView({
                            webPreferences: {
                                nodeIntegration: true,
                                contextIsolation: false
                            }
                        });

                        currentWindow.addBrowserView(devToolsBV);
                        const bvWC = devToolsBV.webContents;
                        gWC.setDevToolsWebContents(bvWC);
                        gWC.openDevTools();

                        updateBrowserViewBounds();
                        isDevToolsSetup = true;
                        globalState.devToolsError = null;

                    } catch (e: any) {
                        if (typeof Editor !== 'undefined') Editor.error('[Bridge] 异常: ' + e.message);
                    }
                }, 20);
            }

            if (devToolsBV) {
                const currentWindow = remote.getCurrentWindow();
                if (newVal === 1) {
                    try {
                        currentWindow.removeBrowserView(devToolsBV);
                        currentWindow.addBrowserView(devToolsBV);
                    } catch (e) { }
                    await nextTick();
                    updateBrowserViewBounds();
                } else {
                    try {
                        currentWindow.removeBrowserView(devToolsBV);
                    } catch (e) { }
                }
            }
        });

        window.addEventListener('resize', () => {
            if (activeTab.value === 1 && devToolsBV) {
                nextTick().then(updateBrowserViewBounds);
            }
        });

        window.addEventListener('panel-hide', _onPanelHide);
        window.addEventListener('panel-show', _onPanelShow);
        window.addEventListener('panel-close', _onPanelClose);
        window.addEventListener('panel-visibility-change', _onVisibilityChange);

        onUnmounted(() => {
            window.removeEventListener('panel-hide', _onPanelHide);
            window.removeEventListener('panel-show', _onPanelShow);
            window.removeEventListener('panel-close', _onPanelClose);
            window.removeEventListener('panel-visibility-change', _onVisibilityChange);
        });
    };

    const openDevToolsExternal = () => {
        try {
            const gameViewEl: any = gameView.value;
            if (gameViewEl) {
                const gid = gameViewEl.getWebContentsId();
                const gWC = remote.webContents.fromId(gid);
                if (gWC) {
                    gWC.openDevTools({ mode: 'undocked' });
                }
            }
        } catch (err: any) {
            if (typeof Editor !== 'undefined') Editor.error('[Bridge] 独立窗口 DevTools 也无法打开:', err.message);
        }
    };

    const _onPanelHide = () => {
        if (devToolsBV) {
            try {
                const currentWindow = remote.getCurrentWindow();
                currentWindow.removeBrowserView(devToolsBV);
            } catch (e) { }
        }
        try {
            const gameViewEl: any = gameView.value;
            if (gameViewEl) {
                const gid = gameViewEl.getWebContentsId();
                if (gid) {
                    const gWC = remote.webContents.fromId(gid);
                    if (gWC && gWC.isDevToolsOpened()) {
                        const devToolsWC = gWC.devToolsWebContents;
                        if (devToolsWC) {
                            const dtWin = remote.BrowserWindow.fromWebContents(devToolsWC);
                            if (dtWin) {
                                externalDevToolsWinId = dtWin.id;
                                dtWin.hide();
                                return;
                            }
                        }
                        wasExternalDevToolsOpened = true;
                        gWC.closeDevTools();
                    }
                }
            }
        } catch (err) { }
    };

    const _onPanelShow = () => {
        if (activeTab.value === 1 && devToolsBV) {
            try {
                const currentWindow = remote.getCurrentWindow();
                currentWindow.removeBrowserView(devToolsBV);
                currentWindow.addBrowserView(devToolsBV);
                nextTick(updateBrowserViewBounds);
            } catch (e) { }
        }
        if (externalDevToolsWinId !== null) {
            try {
                const dtWin = remote.BrowserWindow.fromId(externalDevToolsWinId);
                if (dtWin) {
                    dtWin.show();
                } else {
                    openDevToolsExternal();
                }
            } catch (e) {
                openDevToolsExternal();
            }
            externalDevToolsWinId = null;
        } else if (wasExternalDevToolsOpened) {
            wasExternalDevToolsOpened = false;
            openDevToolsExternal();
        }
    };

    const _onPanelClose = () => {
        _onPanelHide();
        if (devToolsBV) {
            try {
                (devToolsBV.webContents as any).destroy();
            } catch (e) { }
            devToolsBV = null;
            isDevToolsSetup = false;
        }
    };

    const _onVisibilityChange = (e: any) => {
        if (e.detail && e.detail.hidden) {
            _onPanelHide();
        } else {
            _onPanelShow();
        }
    };

    return {
        setupDevToolsWatchers,
        openDevToolsExternal,
        updateBrowserViewBounds
    };
}
