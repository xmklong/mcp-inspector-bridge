// @ts-nocheck
export function initPicker() {
    window.__mcpNodePicker = {
        isActive: false,
        _onMouseMove: null,
        _onClick: null,
        _onKeyDown: null,

        enable: function () {
            const self = this;
            if (self.isActive) return;
            self.isActive = true;
            console.log("[Node Picker] 拾取模式已开启 🎯");

            // 部署 DOM 级阻击探针，免疫全部 Cocos 渲染管线错误
            if (!document.getElementById('__mcp_cursor_tracker')) {
                const tracker = document.createElement('div');
                tracker.id = '__mcp_cursor_tracker';
                tracker.style.position = 'fixed';
                tracker.style.zIndex = '2147483647';
                tracker.style.pointerEvents = 'none';
                tracker.style.width = '8px';
                tracker.style.height = '8px';
                tracker.style.borderRadius = '50%';
                tracker.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
                tracker.style.border = '1px solid white';
                tracker.style.transform = 'translate(-50%, -50%)';
                tracker.style.boxShadow = '0 0 5px rgba(255,0,0,1)';
                // 使用 shadowDOM 或者最外层 body 避免被游戏 canvas 截断
                document.body.appendChild(tracker);
            }

            self._lastMoveTime = 0;
            self._lastHoverUuid = null;

            self._onMouseMove = function (e) {
                if (!self.isActive) return;

                // 实时同步原生探针
                const tracker = document.getElementById('__mcp_cursor_tracker');
                if (tracker) {
                    tracker.style.left = e.clientX + 'px';
                    tracker.style.top = e.clientY + 'px';
                }
                // 节流，50ms一次
                const now = Date.now();
                if (now - self._lastMoveTime < 50) return;
                self._lastMoveTime = now;

                const hitNode = self.hitTest(e.clientX, e.clientY);
                const hitUuid = hitNode ? (hitNode.uuid || hitNode.id) : null;

                // 不再打印高频的 Hover 日志
                if (hitUuid !== self._lastHoverUuid) {
                    self._lastHoverUuid = hitUuid;
                }

                if (hitUuid && window.__mcpCrawler) {
                    window.__mcpCrawler.setHoverTarget(hitUuid);
                } else if (window.__mcpCrawler) {
                    window.__mcpCrawler.setHoverTarget(null);
                }
            };

            self._onClick = function (e) {
                if (!self.isActive) return;
                // 强制阻止物理拦截被别的 Input Manager 抢占
                e.stopPropagation();
                e.preventDefault();
                if (typeof e.stopImmediatePropagation === 'function') {
                    e.stopImmediatePropagation();
                }

                // 仅在 click 或 mouseup 确认拾取
                if (e.type === 'mousedown') return;

                const hitNode = self.hitTest(e.clientX, e.clientY, false);
                let hitUuid = '';
                if (hitNode) {
                    hitUuid = hitNode.uuid || hitNode.id;
                    // console.log(`[Node Picker] Selected Hit: ${hitNode.name} (Size: ${hitNode.width}x${hitNode.height}, UUID: ${hitUuid})`);
                }

                // 同步持久化高亮框焦点
                if (window.__mcpCrawler && window.__mcpCrawler.setSelectionTarget) {
                    window.__mcpCrawler.setSelectionTarget(hitUuid || '');
                }

                // 强制发送无差别 IPC 闭环，确保面板按钮能正确复位
                if (window.__mcpInspector && window.__mcpInspector.sendNodeSelected) {
                    window.__mcpInspector.sendNodeSelected(hitUuid || '');
                }

                self.disable();
            };

            self._onKeyDown = function (e) {
                if (e.key === 'Escape') {
                    if (window.__mcpInspector && window.__mcpInspector.sendNodeSelected) {
                        window.__mcpInspector.sendNodeSelected('');
                    }
                    self.disable();
                }
            };

            // 使用 document.documentElement 绑定在最顶层捕获，防止被任意阻止
            document.documentElement.addEventListener('mousemove', self._onMouseMove, true);
            document.documentElement.addEventListener('mousedown', self._onClick, true);
            document.documentElement.addEventListener('mouseup', self._onClick, true);
            document.documentElement.addEventListener('click', self._onClick, true);
            document.documentElement.addEventListener('keydown', self._onKeyDown, true);
        },

        disable: function () {
            const self = this;
            if (!self.isActive) return;
            self.isActive = false;
            console.log("[Node Picker] 拾取模式已关闭 🛑");

            const tracker = document.getElementById('__mcp_cursor_tracker');
            if (tracker && tracker.parentNode) {
                tracker.parentNode.removeChild(tracker);
            }

            if (self._onMouseMove) document.documentElement.removeEventListener('mousemove', self._onMouseMove, true);
            if (self._onClick) {
                document.documentElement.removeEventListener('mousedown', self._onClick, true);
                document.documentElement.removeEventListener('mouseup', self._onClick, true);
                document.documentElement.removeEventListener('click', self._onClick, true);
            }
            if (self._onKeyDown) document.documentElement.removeEventListener('keydown', self._onKeyDown, true);

            if (window.__mcpCrawler) {
                window.__mcpCrawler.setHoverTarget(null);
            }
        },

        hitTest: function (clientX, clientY, isDebug) {
            const eng = window.cc;
            if (!eng || !eng.director || !eng.view) return null;
            const scene = eng.director.getScene();
            if (!scene) return null;

            // 抓取 GameCanvas 边界，以此为基准进行缩放扣除与偏移
            const canvas = document.getElementById('GameCanvas');
            const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight };

            const frameSize = eng.view.getFrameSize();
            const vp = eng.view.getViewportRect();
            const scaleX = eng.view.getScaleX();
            const scaleY = eng.view.getScaleY();

            // Step 1: DOM 坐标转到以左下角为原点的 Frame 像素坐标 (ScreenPt)
            const x = (clientX - rect.left) * (frameSize.width / rect.width);
            const y = (rect.bottom - clientY) * (frameSize.height / rect.height);
            const screenPt = eng.v2(x, y);

            // Step 2: 扣除视区黑边和缩放，计算出无相机影响的绝对 2D 世界坐标 (WorldPos)
            const worldX = (x - vp.x) / scaleX;
            const worldY = (y - vp.y) / scaleY;
            let baseWorldPos = eng.v2(worldX, worldY);

            if (isDebug) {
                try {
                    console.log(`[Node Picker Raycast] Input:(clientX=${clientX}, clientY=${clientY}) Rect:(left=${rect.left}, bottom=${rect.bottom}, w=${rect.width}, h=${rect.height}) FrameSize:(w=${frameSize.width}, h=${frameSize.height})`);
                    console.log(`[Node Picker Raycast] Viewport:(x=${vp.x}, y=${vp.y}, w=${vp.width}, h=${vp.height}) Scale:(sx=${scaleX}, sy=${scaleY})`);
                    console.log(`[Node Picker Raycast] => ScreenPt:(x=${screenPt.x}, y=${screenPt.y}) => BaseWorldPos:(x=${baseWorldPos.x}, y=${baseWorldPos.y})`);
                } catch (e) { }
            }

            // 如果没拿到 camera 数组就备用一下
            let cameras = [];
            if (eng.Camera && eng.Camera.cameras) {
                cameras = eng.Camera.cameras;
            }

            // 优先测在前部的 Camera
            const sortedCameras = cameras.slice().sort(function (a, b) { return b.depth - a.depth; });
            if (sortedCameras.length === 0) return null;

            let hitCandidates = [];
            let hitNode = null;

            for (let c = 0; c < sortedCameras.length; c++) {
                const camera = sortedCameras[c];
                let worldPos = baseWorldPos; // 默认使用算好的绝对世界坐标

                // Step 3: 如果相机构建了摄像机矩阵（比如渲染 3D 或位移过），则交由相机自行反算
                if (typeof camera.getScreenToWorldPoint === 'function') {
                    const testWorldPos = camera.getScreenToWorldPoint(baseWorldPos);
                    // 极少部分版本的 2D Camera 也许会回传 null 或者不对的向量，如果有返回则使用
                    if (testWorldPos) {
                        worldPos = testWorldPos;
                    }
                }

                if (isDebug) {
                    const camName = camera.node ? camera.node.name : 'Unknown';
                    console.log(`[Node Picker Raycast] Camera[${camName}] Depth=${camera.depth} => WorldPos:(x=${worldPos.x}, y=${worldPos.y})`);
                }

                function walk(node) {
                    if (eng.Scene && node instanceof eng.Scene) {
                        // 场景根节点特判防御，跳过常规属性检测，直接深入其子节点
                        const children = node.children;
                        for (let i = children.length - 1; i >= 0; i--) {
                            walk(children[i]);
                        }
                        return;
                    }

                    try {
                        if (node.activeInHierarchy === false) {
                            if (isDebug) console.log(`[Trace] 深度剪枝 ${node.name}: activeInHierarchy=false`);
                            return;
                        }
                        if (node.opacity === 0 || (node.color && node.color.a === 0)) {
                            if (isDebug) console.log(`[Trace] 深度剪枝 ${node.name}: 透明度归零不可见`);
                            return;
                        }
                    } catch (e) {
                        return;
                    }

                    const children = node.children;
                    for (let i = children.length - 1; i >= 0; i--) {
                        walk(children[i]);
                    }

                    // 必须等子节点都检测完，再测自身！
                    // 因为 Cocos里父节点的 group 不对，不代表子节点的 group 被剔除！
                    try {
                        if ((camera.cullingMask & (1 << node.groupIndex)) === 0) {
                            if (isDebug) console.log(`[Trace] 忽略自身 ${node.name}: 被相机(${camera.node ? camera.node.name : 'Unknown'}) 的 cullingMask 剔除`);
                            return;
                        }
                    } catch (e) {
                        return;
                    }

                    if (node.width > 0 && node.height > 0) {
                        if (node.name === '__mcp_hover_overlay__' || node.name === '__mcp_select_overlay__') return;

                        // 核心过滤：必须存在真实可见的渲染组件（排除空有大小但不可见的排版包裹层和交互事件幽灵层）
                        let hasRenderComp = false;
                        if (node._components) {
                            for (let k = 0; k < node._components.length; k++) {
                                const comp = node._components[k];
                                if (comp && comp.enabled === false) continue; // 禁用的组件直接无视

                                const compName = comp.name || (comp.constructor ? comp.constructor.name : '');
                                const isRender = (eng.RenderComponent && comp instanceof eng.RenderComponent) ||
                                    (compName.indexOf('Sprite') > -1 || compName.indexOf('Label') > -1 ||
                                        compName.indexOf('RichText') > -1 || compName.indexOf('Graphics') > -1 ||
                                        compName.indexOf('Skeleton') > -1 || compName.indexOf('Particle') > -1 ||
                                        compName.indexOf('Mesh') > -1 || compName.indexOf('VideoPlayer') > -1 ||
                                        compName.indexOf('WebView') > -1);

                                if (isRender) {
                                    // 极度严格的幽灵节点甄别（针对用作全屏事件阻挡但无透传绘制的 Sprite 占位符）
                                    if (compName.indexOf('Sprite') > -1) {
                                        if (!comp.spriteFrame && !comp._spriteFrame) {
                                            if (isDebug) console.log(`[Trace] 剥离幽灵节点 ${node.name}: Sprite 纹理为空`);
                                            continue;
                                        }
                                    }
                                    if (compName.indexOf('Label') > -1 || compName.indexOf('RichText') > -1) {
                                        if (!comp.string || comp.string === '') {
                                            if (isDebug) console.log(`[Trace] 剥离幽灵节点 ${node.name}: 文本内容为空`);
                                            continue;
                                        }
                                    }
                                    hasRenderComp = true;
                                    break;
                                }
                            }
                        }

                        if (!hasRenderComp) {
                            if (isDebug) console.log(`[Filter] 跳过了 ${node.name}：无渲染组件实体 (width=${node.width}, height=${node.height})`);
                            return; // 排除仅有大小但无渲染物体的空节点包裹层
                        }

                        let isHit = false;

                        // 1. 首选方案：劫持引擎最底层的点乘逆向矩阵判断算法 (完美支持层级、相机缩放、Fit策略)
                        if (typeof node._hitTest === 'function') {
                            isHit = node._hitTest(worldPos);
                            if (isDebug) {
                                if (isHit) console.log(`[Hit] 命中🎯 ${node.name}: _hitTest(WorldPos(${worldPos.x}, ${worldPos.y})) == true`);
                                else console.log(`[Miss] 射线不在此节点内 ${node.name}: _hitTest 返回 false`);
                            }
                        } else if (typeof node.convertToNodeSpaceAR === 'function') {
                            // 2. 降级方案：经典本地映射碰撞 (针对非常古老无 _hitTest 的引擎版本)
                            const localPt = node.convertToNodeSpaceAR(worldPos);
                            const ax = node.anchorX !== undefined ? node.anchorX : 0.5;
                            const ay = node.anchorY !== undefined ? node.anchorY : 0.5;

                            const ptLeft = -ax * node.width;
                            const ptRight = (1 - ax) * node.width;
                            const ptBottom = -ay * node.height;
                            const ptTop = (1 - ay) * node.height;

                            isHit = (localPt.x >= ptLeft && localPt.x <= ptRight && localPt.y >= ptBottom && localPt.y <= ptTop);
                            if (isDebug) {
                                if (isHit) console.log(`[Hit] 命中🎯 ${node.name}: LocalPt(${localPt.x}, ${localPt.y}) 命中内框`);
                                else if (node.name !== 'Main Camera' && node.name !== 'GameCamera' && node.name !== 'UICamera') {
                                    console.log(`[Miss] 射线不在此节点内 ${node.name}: LocalPt(${localPt.x}, ${localPt.y}) outside BBox. WorldPos(${worldPos.x}, ${worldPos.y})`);
                                }
                            }
                        }

                        if (isHit) {
                            const area = node.width * node.height;
                            if (area > 0) {
                                hitCandidates.push({
                                    node: node,
                                    area: area,
                                    hierarchyIndex: hitCandidates.length
                                });
                            }
                            return null; // 继续扫描下方其他重叠层次
                        }
                    } else {
                        if (isDebug) {
                            let isRender = false;
                            if (node._components) {
                                for (let k = 0; k < node._components.length; k++) {
                                    const compName = node._components[k].name || (node._components[k].constructor ? node._components[k].constructor.name : '');
                                    if (compName.indexOf('Sprite') > -1 || compName.indexOf('Label') > -1) {
                                        isRender = true; break;
                                    }
                                }
                            }
                            if (isRender) console.log(`[Miss] ${node.name} 虽有渲染组件但被静默抛弃, 因宽高为零 (w=${node.width}, h=${node.height})`);
                        }
                    }
                    return null;
                }

                walk(scene);
            }

            if (hitCandidates.length > 0) {
                hitCandidates.sort(function (a, b) {
                    if (a.area !== b.area) {
                        return a.area - b.area; // 面积越小越靠前（通常代表是独立精细控件而非巨大的背景遮罩）
                    }
                    return b.hierarchyIndex - a.hierarchyIndex; // 面积一致时，数组压入较晚的优先（因为深度优先后搜到的往往是在上层渲染）
                });

                hitNode = hitCandidates[0].node;
                if (isDebug) {
                    hitCandidates.forEach(function (can, idx) {
                        console.log(`   #${idx}: ${can.node.name} [Area: ${can.area}]`);
                    });
                }
            }

            if (hitNode) {
                return hitNode;
            }
            return null;
        }
    };
}
