const { ref, computed, watch } = require('vue');
declare const Editor: any;

export function useLayout(globalState: any, wrapMount: any, wrapperSize: any) {
    const selectedResolution = ref('FIT');
    const isLandscape = ref(false);
    
    // Split pane logic
    const rightPanelWidth = ref(400);
    const isDragging = ref(false);

    const startDrag = (downEvent: MouseEvent) => {
        isDragging.value = true;
        const startX = downEvent.clientX;
        const startWidth = rightPanelWidth.value;

        const onMouseMove = (e: MouseEvent) => {
            if (!isDragging.value) return;
            const deltaX = e.clientX - startX;
            const newWidth = startWidth - deltaX;

            if (newWidth > 200 && newWidth < document.body.clientWidth - 300) {
                rightPanelWidth.value = newWidth;
            }
        };
        const onMouseUp = () => {
            isDragging.value = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            try {
                if (typeof Editor !== 'undefined' && Editor.Ipc) {
                    Editor.Ipc.sendToMain('mcp-inspector-bridge:save-panel-width', rightPanelWidth.value);
                }
            } catch (e) { }
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const nodeTreePanelWidth = ref(250);
    const isNodeTreeDragging = ref(false);

    try {
        const savedW = window.localStorage.getItem('mcp-inspector-nodetree-width');
        if (savedW) {
            const wNum = parseInt(savedW, 10);
            if (!isNaN(wNum) && wNum >= 150) {
                nodeTreePanelWidth.value = wNum;
            }
        }
    } catch(e) {}

    const startNodeTreeDrag = (downEvent: MouseEvent) => {
        isNodeTreeDragging.value = true;
        if (downEvent.preventDefault) downEvent.preventDefault();
        
        const startX = downEvent.clientX;
        const startWidth = nodeTreePanelWidth.value;

        const onMouseMove = (e: MouseEvent) => {
            if (!isNodeTreeDragging.value) return;
            const deltaX = e.clientX - startX;
            const newWidth = startWidth + deltaX;

            const maxW = rightPanelWidth.value - 250;
            if (newWidth > 150 && newWidth < (maxW > 150 ? maxW : 9999)) {
                nodeTreePanelWidth.value = newWidth;
            }
        };
        const onMouseUp = () => {
            isNodeTreeDragging.value = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            try {
                window.localStorage.setItem('mcp-inspector-nodetree-width', nodeTreePanelWidth.value.toString());
            } catch (e) { }
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const gameContainerStyle = computed(() => {
        if (selectedResolution.value === 'FIT' || wrapperSize.value.width === 0) {
            return { width: '100%', height: '100%', position: 'relative', overflow: 'hidden' };
        }
        const parts = selectedResolution.value.split('x');
        let targetW = parseInt(parts[0]);
        let targetH = parseInt(parts[1]);

        if (isLandscape.value) {
            const tmp = targetW; targetW = targetH; targetH = tmp;
        }

        const scale = Math.min(
            (wrapperSize.value.width * 0.95) / targetW,
            (wrapperSize.value.height * 0.95) / targetH
        );

        return {
            width: Math.floor(targetW) + 'px',
            height: Math.floor(targetH) + 'px',
            left: '50%',
            top: '50%',
            position: 'absolute',
            overflow: 'hidden',
            transform: `translate(-50%, -50%) scale(${scale})`,
            transformOrigin: 'center center'
        };
    });

    const rotateScreen = () => { isLandscape.value = !isLandscape.value; };

    const setupResizeObserver = () => {
        const wrap = wrapMount.value;
        if (wrap) {
            try {
                new ResizeObserver((entries: any) => {
                    window.requestAnimationFrame(() => {
                        if (!entries.length) return;
                        const rect = entries[0].contentRect;
                        if (rect.width <= 0 || rect.height <= 0) {
                            if (!globalState.isHidden) {
                                globalState.isHidden = true;
                                window.dispatchEvent(new CustomEvent('panel-visibility-change', { detail: { hidden: true } }));
                            }
                            return;
                        } else {
                            if (globalState.isHidden) {
                                globalState.isHidden = false;
                                window.dispatchEvent(new CustomEvent('panel-visibility-change', { detail: { hidden: false } }));
                            }
                        }
                        wrapperSize.value.width = rect.width;
                        wrapperSize.value.height = rect.height;
                        globalState.isNarrow = rect.width < 500;
                    });
                }).observe(wrap);
            } catch (e) {
                if (wrap.clientWidth > 0 && wrap.clientHeight > 0) {
                    wrapperSize.value.width = wrap.clientWidth;
                    wrapperSize.value.height = wrap.clientHeight;
                }
                window.addEventListener('resize', () => {
                    const isHidden = wrap.clientWidth <= 0 || wrap.clientHeight <= 0;
                    if (isHidden) {
                        if (!globalState.isHidden) {
                            globalState.isHidden = true;
                            window.dispatchEvent(new CustomEvent('panel-visibility-change', { detail: { hidden: true } }));
                        }
                        return;
                    } else {
                        if (globalState.isHidden) {
                            globalState.isHidden = false;
                            window.dispatchEvent(new CustomEvent('panel-visibility-change', { detail: { hidden: false } }));
                        }
                    }
                    wrapperSize.value.width = wrap.clientWidth;
                    wrapperSize.value.height = wrap.clientHeight;
                    globalState.isNarrow = wrap.clientWidth < 500;
                });
            }
        }
    };

    watch(selectedResolution, (newVal: string) => {
        try {
            if (typeof Editor !== 'undefined' && Editor.Ipc) {
                Editor.Ipc.sendToMain('mcp-inspector-bridge:save-resolution', newVal);
            }
        } catch (e) { }
    });

    return {
        selectedResolution,
        isLandscape,
        rightPanelWidth,
        isDragging,
        startDrag,
        nodeTreePanelWidth,
        isNodeTreeDragging,
        startNodeTreeDrag,
        gameContainerStyle,
        rotateScreen,
        setupResizeObserver
    };
}
