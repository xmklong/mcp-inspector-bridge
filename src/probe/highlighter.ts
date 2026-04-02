// @ts-nocheck
import { Logger } from './logger';
export function initHighlighter() {
    // 初始化高亮状态存储
    window.__mcpHighlightData = {
        hoverId: null,
        selectId: null,
        hoverNode: null,
        hoverGraphics: null,
        selectNode: null,
        selectGraphics: null,
        rootNode: null,
        lastLoggedDrawID: null
    };
}

export function startHighlighterHook() {
    Logger.log('[Highlighter] startHighlighterHook 被触发，准备首次调用 _initHighlightLayer');
    _initHighlightLayer();

    if (window.cc && window.cc.director) {
        window.cc.director.on(window.cc.Director.EVENT_AFTER_SCENE_LAUNCH, () => {
            Logger.log('[Highlighter] EVENT_AFTER_SCENE_LAUNCH 触发，再次调用 _initHighlightLayer');
            _initHighlightLayer();
        });

        // 监听渲染帧重绘
        window.cc.director.on(window.cc.Director.EVENT_AFTER_UPDATE, () => {
            const data = window.__mcpHighlightData;
            const eng = window.cc;
            if (!data.hoverGraphics || !data.hoverNode || !data.hoverNode.isValid ||
                !data.selectGraphics || !data.selectNode || !data.selectNode.isValid) {
                if (eng && eng.director && eng.director.getScene()) {
                    _initHighlightLayer();
                }
                return;
            }
            if (eng.view) {
                const visibleSize = eng.view.getVisibleSize();
                const inspectorCamera = window.__mcpInspectorCamera;
                if (inspectorCamera && inspectorCamera.node) {
                    inspectorCamera.orthoSize = visibleSize.height / 2;
                    inspectorCamera.node.setPosition(visibleSize.width / 2, visibleSize.height / 2);
                }
            }

            // 防止其它业务摄像机渲染高亮层，造成视觉重绘错位
            if (eng.Camera && eng.Camera.cameras) {
                for (let i = 0; i < eng.Camera.cameras.length; i++) {
                    const c = eng.Camera.cameras[i];
                    if (c && c.node && c.node.name !== 'InspectorCamera') {
                        c.cullingMask = c.cullingMask & ~(1 << 30);
                    }
                }
            }

            const hoverG = data.hoverGraphics;
            const selectG = data.selectGraphics;

            hoverG.clear();
            selectG.clear();

            function getAccurateWorldCorners(node) {
                if (!node || typeof node.convertToWorldSpaceAR !== 'function') return null;
                const width = node.width || 0;
                const height = node.height || 0;
                const ax = node.anchorX !== undefined ? node.anchorX : 0.5;
                const ay = node.anchorY !== undefined ? node.anchorY : 0.5;
                const l = -ax * width;
                const b = -ay * height;
                const r = (1 - ax) * width;
                const t = (1 - ay) * height;

                const corners = [
                    eng.v2(l, b), // bl
                    eng.v2(r, b), // br
                    eng.v2(r, t), // tr
                    eng.v2(l, t)  // tl
                ];

                const worldCorners = [];
                for (let i = 0; i < corners.length; i++) {
                    const pt = node.convertToWorldSpaceAR(corners[i]);
                    worldCorners.push(pt);
                }
                return worldCorners;
            }

            function drawNodeBox(uuid, g, isHover, graphicsNode) {
                if (!uuid) return;
                const target = window.__mcpCrawler ? window.__mcpCrawler.findNodeByUuid(uuid) : null;
                if (!target || !target.isValid || target === data.hoverNode || target === data.selectNode) return;

                let targetCam = null;
                let maxDepth = -999999;
                if (eng.Camera && eng.Camera.cameras) {
                    for (let i = 0; i < eng.Camera.cameras.length; i++) {
                        const cam = eng.Camera.cameras[i];
                        if (cam.enabled !== false && cam.depth < 9000 && cam.depth > maxDepth && (cam.cullingMask & (1 << target.groupIndex)) !== 0) {
                            maxDepth = cam.depth;
                            targetCam = cam;
                        }
                    }
                }
                if (!targetCam) {
                    if (eng.Camera && eng.Camera.cameras && eng.Camera.cameras.length > 0) {
                        targetCam = eng.Camera.cameras[0];
                    } else {
                        return;
                    }
                }

                if (isHover) {
                    g.strokeColor = new eng.Color(0, 204, 255, 255); // 浅蓝色边框
                    g.fillColor = new eng.Color(0, 204, 255, 40);    // 浅蓝透明填充
                } else {
                    g.strokeColor = new eng.Color(255, 80, 0, 255);  // 偏红橙色强调边框
                    g.fillColor = new eng.Color(255, 80, 0, 80);     // 较高透明度填充
                }

                const width = target.width || 0;
                const height = target.height || 0;
                
                // 节点尺寸都为 0 时走点兜底画圈
                if (width === 0 && height === 0) {
                    let center = eng.v2(0, 0);
                    if (typeof target.convertToWorldSpaceAR === 'function') {
                        center = target.convertToWorldSpaceAR(center);
                    }
                    if (typeof targetCam.getWorldToScreenPoint === 'function') {
                        center = targetCam.getWorldToScreenPoint(center);
                        if (window.__mcpInspectorCamera && typeof window.__mcpInspectorCamera.getScreenToWorldPoint === 'function') {
                            center = window.__mcpInspectorCamera.getScreenToWorldPoint(center);
                        }
                    }
                    if (isNaN(center.x) || isNaN(center.y)) return; // 彻底损坏的节点不予绘制

                    g.circle(center.x, center.y, 8);
                    g.fill();
                    g.moveTo(center.x - 12, center.y);
                    g.lineTo(center.x + 12, center.y);
                    g.moveTo(center.x, center.y - 12);
                    g.lineTo(center.x, center.y + 12);
                    g.stroke();
                    return;
                }

                let worldCorners = getAccurateWorldCorners(target);
                if (worldCorners && (isNaN(worldCorners[0].x) || isNaN(worldCorners[0].y))) {
                    worldCorners = null; 
                }

                if (!worldCorners) return;

                const drawPoints = [];
                for (let i = 0; i < worldCorners.length; i++) {
                    if (typeof targetCam.getWorldToScreenPoint === 'function') {
                        let scPt = targetCam.getWorldToScreenPoint(worldCorners[i]);
                        if (window.__mcpInspectorCamera && typeof window.__mcpInspectorCamera.getScreenToWorldPoint === 'function') {
                            scPt = window.__mcpInspectorCamera.getScreenToWorldPoint(scPt);
                        }
                        drawPoints.push(scPt);
                    } else {
                        drawPoints.push(worldCorners[i]);
                    }
                }

                if (!isHover && window.__mcpHighlightData && window.__mcpHighlightData.lastLoggedDrawID !== uuid) {
                    window.__mcpHighlightData.lastLoggedDrawID = uuid;
                    Logger.log(`[Highlight Render] Selecting Node: ${target.name} (${uuid})`);
                    Logger.log(`[Highlight Render] Camera: ${targetCam ? targetCam.node.name : 'Unknown'}, CullingMask: ${targetCam ? targetCam.cullingMask : 'N/A'}, Depth: ${targetCam ? targetCam.depth : 'N/A'}`);
                    Logger.log(`[Highlight Render] Size: ${width}x${height}`);
                    Logger.log(`[Highlight Render] W_P0: x=${worldCorners[0].x.toFixed(2)}, y=${worldCorners[0].y.toFixed(2)} | S_P0: x=${drawPoints[0].x.toFixed(2)}, y=${drawPoints[0].y.toFixed(2)}`);
                    Logger.log(`[Highlight Render] ViewSize: ${eng.view.getVisibleSize().width}x${eng.view.getVisibleSize().height}`);
                }

                g.moveTo(drawPoints[0].x, drawPoints[0].y);
                g.lineTo(drawPoints[1].x, drawPoints[1].y);
                g.lineTo(drawPoints[2].x, drawPoints[2].y);
                g.lineTo(drawPoints[3].x, drawPoints[3].y);
                g.close();
                g.fill();
                g.stroke();
            }

            if (data.selectId) {
                drawNodeBox(data.selectId, selectG, false, data.selectNode);
            }

            // 如果悬停对象与选中焦点为同一个（或者为父级选中的同组逻辑等但 UUID 一致的情况则屏蔽画笔）
            if (data.hoverId && data.hoverId !== data.selectId) {
                drawNodeBox(data.hoverId, hoverG, true, data.hoverNode);
            }
        });
    }
}

function _initHighlightLayer() {
    Logger.log('[Highlighter] _initHighlightLayer 触发调用');
    try {
        const eng = window.cc;
        if (!eng || !eng.director) {
            Logger.warn('[Highlighter] _initHighlightLayer 终止：window.cc 或 window.cc.director 不存在');
            return;
        }
        const scene = eng.director.getScene();
        if (!scene) {
            Logger.warn('[Highlighter] _initHighlightLayer 终止：director.getScene() 返回为空');
            return;
        }

        if (window.__mcpHighlightData && window.__mcpHighlightData.rootNode && window.__mcpHighlightData.rootNode.isValid) {
            Logger.log('[Highlighter] _initHighlightLayer 遇防抖卡点：缓存中的持久化根节点依然有效，直接退出。');
            return; 
        } else if (window.__mcpHighlightData && window.__mcpHighlightData.rootNode) {
            Logger.warn('[Highlighter] 发现原有持久化根节点已处于失联(isValid=false)状态，此现象可能引发重建。');
        }

        let root = scene.getChildByName('McpInspectorRoot');
        if (!root) {
            Logger.warn(`[Highlighter] 未向当前 Scene 寻找到 McpInspectorRoot，准备创建全新根节点体系！TriggerStack:`, new Error().stack);
            root = new eng.Node('McpInspectorRoot');

            if (window.__mcpHighlightData) {
                window.__mcpHighlightData.rootNode = root;
            }

            root.groupIndex = 30;
            root.setPosition(0, 0);
            if (eng.view) {
                const visibleSize = eng.view.getVisibleSize();
                root.setContentSize(visibleSize.width, visibleSize.height);
            }

            if (eng.Object && eng.Object.Flags) {
                root._objFlags |= (eng.Object.Flags.DontSave | eng.Object.Flags.HideInHierarchy);
            }
            root.zIndex = 99999;
            scene.addChild(root, 99999);
            if (eng.game && typeof eng.game.addPersistRootNode === 'function') {
                eng.game.addPersistRootNode(root);
            }

            const camNode = new eng.Node('InspectorCamera');
            camNode.setPosition(0, 0);
            root.addChild(camNode);
            const cam = camNode.addComponent(eng.Camera);
            cam.depth = 9999;

            // Safely assign group 30 culling mask
            cam.cullingMask = 1 << 30;

            // Use DEPTH_ONLY flag without clearing color to avoid black screen, but some older WebGL needs COLOR too 
            cam.clearFlags = (eng.Camera && eng.Camera.ClearFlag) ? eng.Camera.ClearFlag.DEPTH : 256;
            cam.backgroundColor = eng.Color.TRANSPARENT;

            cam.alignWithScreen = false;

            window.__mcpInspectorCamera = cam;
        } else {
            Logger.log('[Highlighter] 在当前 Scene 中找到了已存在的 McpInspectorRoot，复用该节点。');
            if (window.__mcpHighlightData) {
                window.__mcpHighlightData.rootNode = root;
            }
            // 关键修复：面板热更时（Scene未销毁但 Webview 环境被刷新），必须重新绑定摄像机实例！
            const existingCamNode = root.getChildByName('InspectorCamera');
            if (existingCamNode) {
                window.__mcpInspectorCamera = existingCamNode.getComponent(eng.Camera);
            }
        }

        function getOrCreateOverlay(name) {
            let existing = root.getChildByName(name);
            if (existing) {
                let g = existing.getComponent(eng.Graphics);
                if (!g) g = existing.addComponent(eng.Graphics);
                return { node: existing, graphics: g };
            }
            const node = new eng.Node(name);
            node.setAnchorPoint(0, 0);
            node.setPosition(0, 0);
            if (eng.view) {
                const visibleSize = eng.view.getVisibleSize();
                node.setContentSize(visibleSize.width, visibleSize.height);
            }
            node.groupIndex = 30;
            const graphics = node.addComponent(eng.Graphics);
            graphics.lineWidth = 2;
            root.addChild(node);
            return { node, graphics };
        }

        const hover = getOrCreateOverlay('__mcp_hover_overlay__');
        window.__mcpHighlightData.hoverNode = hover.node;
        window.__mcpHighlightData.hoverGraphics = hover.graphics;

        const select = getOrCreateOverlay('__mcp_select_overlay__');
        window.__mcpHighlightData.selectNode = select.node;
        window.__mcpHighlightData.selectGraphics = select.graphics;
        
        Logger.log('[Highlighter] _initHighlightLayer 完整执行成功，相关 Graphics 工具已就绪！');
    } catch (err) {
        console.error('[Highlighter] _initHighlightLayer 执行中发生严重错误而中断！', err);
    }
}
