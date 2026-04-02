declare const Editor: any;
import * as fs from 'fs';
import * as path from 'path';

const { createApp, ref, onMounted, watch } = require('vue');
const { NodeTree } = require('./components/NodeTree');
const { NodeInspector } = require('./components/NodeInspector');
const { RenderDebugger } = require('./components/RenderDebugger');

const templateRaw = fs.readFileSync(path.join(__dirname, '../../src/panel/index.html'), 'utf-8');
const preloadUrlResolved = 'file:///' + Editor.url('packages://mcp-inspector-bridge/dist/preload.js').replace(/\\/g, '/');
const templateStr = templateRaw.replace('PRELOAD_PLACEHOLDER', preloadUrlResolved);

const http = require('http');

const { globalState } = require('./store');
const { useLayout } = require('./composables/useLayout');
const { useTabs } = require('./composables/useTabs');
const { useGameView } = require('./composables/useGameView');
const { useDevTools } = require('./composables/useDevTools');
const { useProfiler } = require('./composables/useProfiler');
const { useNodeSystem } = require('./composables/useNodeSystem');

module.exports = Editor.Panel.extend({
    style: `
        :host { display: flex; flex-direction: column; width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; }
    `,
    template: templateStr,

    $: {
        app: '#app',
        gameView: '#game-view'
    },

    ready() {
        const panelAppElement = this.$app;

        const app = createApp({
            components: { NodeTree, 'node-inspector': NodeInspector, 'render-debugger': RenderDebugger },
            setup() {
                const activeTab = ref(0);
                const wrapperSize = ref({ width: 0, height: 0 });

                // Vue Refs
                const gameView = ref(null);
                const devtoolsView = ref(null);
                const wrapMount = ref(null);
                const nodeTreeRef = ref(null);

                // Initialize Composables
                const layoutSystem = useLayout(globalState, wrapMount, wrapperSize);
                const tabSystem = useTabs();
                const profilerSystem = useProfiler(globalState, gameView, activeTab);
                
                const nodeSystem = useNodeSystem(globalState, gameView, nodeTreeRef, activeTab);

                const gameViewSystem = useGameView(
                    globalState, 
                    gameView, 
                    nodeTreeRef, 
                    layoutSystem.rightPanelWidth, 
                    layoutSystem.selectedResolution,
                    (payload: any, auto: boolean) => nodeSystem.onNodeSelect(payload, auto)
                );

                const devToolsSystem = useDevTools(globalState, gameView, devtoolsView, activeTab, layoutSystem.rightPanelWidth);

                const electron = require('electron');
                const savedScale = window.localStorage.getItem('mcp-ui-scale');
                if (savedScale && !isNaN(parseFloat(savedScale))) {
                    globalState.uiScale = parseFloat(savedScale);
                }
                const savedLayout = window.localStorage.getItem('mcp-inspector-layout');
                if (savedLayout === 'vertical' || savedLayout === 'horizontal') {
                    globalState.inspectorLayout = savedLayout;
                }

                watch(() => globalState.inspectorLayout, (newVal: string) => {
                    try {
                        window.localStorage.setItem('mcp-inspector-layout', newVal);
                    } catch(e) {}
                });

                watch(() => globalState.uiScale, (newVal: number) => {
                    try {
                        if (typeof Editor !== 'undefined') {
                            Editor.log('[MCP Inspector] -> Executing scale:', newVal, '| target:', !!panelAppElement);
                        } else {
                            console.log('[MCP Inspector] -> Executing scale:', newVal, '| target:', !!panelAppElement);
                        }
                        
                        // 直接通过插件生命周期的 this.$app 句柄施加原生缩放设置，突破 Shadow DOM 与 Vue 挂载盲区。
                        if (panelAppElement) {
                            panelAppElement.style.zoom = newVal.toString();
                        }
                        window.localStorage.setItem('mcp-ui-scale', newVal.toString());

                        setTimeout(() => {
                            if (devToolsSystem.updateBrowserViewBounds) {
                                devToolsSystem.updateBrowserViewBounds();
                            }
                        }, 20);
                    } catch(e) {}
                });

                onMounted(() => {
                    layoutSystem.setupResizeObserver();
                    gameViewSystem.setupGameViewListeners();
                    devToolsSystem.setupDevToolsWatchers();
                    profilerSystem.setupProfilerWatchers();
                    
                    if (panelAppElement) {
                        panelAppElement.style.zoom = globalState.uiScale.toString();
                    }
                });

                return {
                    activeTab,
                    globalState,
                    gameView,
                    devtoolsView,
                    wrapMount,
                    nodeTreeRef,

                    ...layoutSystem,
                    ...tabSystem,
                    ...gameViewSystem,
                    ...devToolsSystem,
                    ...profilerSystem,
                    ...nodeSystem
                };
            }
        });

        app.mount(this.$app);
    },

    messages: {
        'scene-status-changed'(event: any, payload: any) {
            window.dispatchEvent(new CustomEvent('scene-status-changed', { detail: payload }));
        }
    },

    show() {
        window.dispatchEvent(new CustomEvent('panel-show'));
    },

    hide() {
        window.dispatchEvent(new CustomEvent('panel-hide'));
    },

    close() {
        window.dispatchEvent(new CustomEvent('panel-close'));
    }
});
