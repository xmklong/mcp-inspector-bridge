// @ts-nocheck
export function initHighlighter() {
    // 初始化高亮状态存储
    window.__mcpHighlightData = {
        hoverId: null,
        selectId: null,
        hoverNode: null,
        hoverGraphics: null,
        selectNode: null,
        selectGraphics: null,
    };
}

export function startHighlighterHook() {
    _initHighlightLayer();
    
    if (window.cc && window.cc.director) {
        window.cc.director.on(window.cc.Director.EVENT_AFTER_SCENE_LAUNCH, () => {
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
            const hoverG = data.hoverGraphics;
            const selectG = data.selectGraphics;

            hoverG.clear();
            selectG.clear();

            function drawNodeBox(uuid, g, isHover, graphicsNode) {
                if (!uuid) return;
                const target = window.__mcpCrawler ? window.__mcpCrawler.findNodeByUuid(uuid) : null;
                if (!target || !target.isValid || target === data.hoverNode || target === data.selectNode) return;
                
                let isScene = false;
                if (typeof eng !== 'undefined' && eng.Scene && target instanceof eng.Scene) {
                    isScene = true;
                }

                // 动态推断最佳渲染分组：为了防止 Target 的 group 处于背景摄像机导致包围框被 UI 遮挡
                let bestGroupIndex = target.groupIndex;
                if (eng.Camera && eng.Camera.cameras && eng.Camera.cameras.length > 0) {
                    let topCamera = null;
                    let maxDepth = -999999;
                    for (let i = 0; i < eng.Camera.cameras.length; i++) {
                        const cam = eng.Camera.cameras[i];
                        if (cam.depth > maxDepth) {
                            maxDepth = cam.depth;
                            topCamera = cam;
                        }
                    }
                    if (topCamera) {
                        if ((topCamera.cullingMask & (1 << target.groupIndex)) !== 0) {
                            bestGroupIndex = target.groupIndex;
                        } else {
                            for (let i = 0; i < 32; i++) {
                                if ((topCamera.cullingMask & (1 << i)) !== 0) {
                                    bestGroupIndex = i;
                                    break;
                                }
                            }
                        }
                    }
                }

                // 同步最佳分组，确保绝对置顶可见
                if (bestGroupIndex !== undefined && graphicsNode.groupIndex !== bestGroupIndex) {
                    graphicsNode.groupIndex = bestGroupIndex;
                }
                if (isHover) {
                    g.strokeColor = new eng.Color(0, 204, 255, 255); // 浅蓝色边框
                    g.fillColor = new eng.Color(0, 204, 255, 60);    // 浅蓝半透
                } else {
                    g.strokeColor = new eng.Color(255, 153, 0, 255); // 橙色金边
                    g.fillColor = new eng.Color(255, 153, 0, 100);   // 焦点态不透明度高
                }

                const poly = window.__mcpCrawler ? window.__mcpCrawler.getNodeWorldPolygon(target) : null;
                if (!poly) {
                    let center = eng.v2(0, 0);
                    if (typeof target.convertToWorldSpaceAR === 'function') {
                        center = target.convertToWorldSpaceAR(center);
                    }
                    g.circle(center.x, center.y, 8);
                    g.fill();
                    g.moveTo(center.x - 12, center.y);
                    g.lineTo(center.x + 12, center.y);
                    g.moveTo(center.x, center.y - 12);
                    g.lineTo(center.x, center.y + 12);
                    g.stroke();
                    return;
                }

                const bl = poly[0], br = poly[1], tr = poly[2], tl = poly[3];
                g.moveTo(bl.x, bl.y);
                g.lineTo(br.x, br.y);
                g.lineTo(tr.x, tr.y);
                g.lineTo(tl.x, tl.y);
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
    const eng = window.cc;
    if (!eng || !eng.director) return;
    const scene = eng.director.getScene();
    if (!scene) return;

    function getOrCreateOverlay(name) {
        let existing = scene.getChildByName(name);
        if (existing) {
            return { node: existing, graphics: existing.getComponent(eng.Graphics) };
        }
        const node = new eng.Node(name);
        if (eng.Object && eng.Object.Flags) {
            node._objFlags |= (eng.Object.Flags.DontSave | eng.Object.Flags.HideInHierarchy);
        }
        node.zIndex = 99999;
        const graphics = node.addComponent(eng.Graphics);
        graphics.lineWidth = 2;
        scene.addChild(node, 99999);
        if (eng.game && typeof eng.game.addPersistRootNode === 'function') {
            eng.game.addPersistRootNode(node);
        }
        return { node, graphics };
    }

    const hover = getOrCreateOverlay('__mcp_hover_overlay__');
    window.__mcpHighlightData.hoverNode = hover.node;
    window.__mcpHighlightData.hoverGraphics = hover.graphics;

    const select = getOrCreateOverlay('__mcp_select_overlay__');
    window.__mcpHighlightData.selectNode = select.node;
    window.__mcpHighlightData.selectGraphics = select.graphics;
}
