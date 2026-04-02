// @ts-nocheck
import { Logger } from './logger';
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
            Logger.log("[Node Picker] 拾取模式已开启 🎯");

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

                const hitNode = self.hitTest(e.clientX, e.clientY); // 调试完毕，关闭 isDebug
                let hitUuid = '';
                if (hitNode) {
                    hitUuid = hitNode.uuid || hitNode.id;
                }

                Logger.log(`[Picker Trigger] 鼠标点击完成，决议抛出的 hitUuid 值为: ${hitUuid || 'null'} (Node: ${hitNode ? hitNode.name : 'Unknown'})`);

                // 同步持久化高亮框焦点
                if (window.__mcpCrawler && window.__mcpCrawler.setSelectionTarget) {
                    window.__mcpCrawler.setSelectionTarget(hitUuid || '');
                }

                // 强制发送无差别 IPC 闭环，确保面板按钮能正确复位
                if (window.__mcpInspector && window.__mcpInspector.sendNodeSelected) {
                    Logger.log(`[Selection-Debug] Trigger: Probe-Picker-sendNodeSelected | HitUuid: ${hitUuid || 'null'} | Broadcasting to IPC channel...`);
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
            Logger.log("[Node Picker] 拾取模式已关闭 🛑");

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

        hitTest: function (clientX, clientY) {
            const eng = window.cc;
            if (!eng || !eng.director || !eng.view) return null;
            const scene = eng.director.getScene();
            if (!scene) return null;

            // DOM坐标换算到逻辑屏幕坐标 screenPt
            const canvas = document.getElementById('GameCanvas');
            const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight };

            const frameSize = eng.view.getFrameSize();
            // 直接计算出 2D 逻辑屏幕坐标 (未扣除视口和缩放的纯 screenPt)
            const x = (clientX - rect.left) * (frameSize.width / rect.width);
            const y = (rect.bottom - clientY) * (frameSize.height / rect.height);
            const screenPt = eng.v2(x, y);

            // 扣除视区黑边和缩放，计算出无相机影响的绝对 2D 世界坐标 (WorldPos - fallback)
            const vp = eng.view.getViewportRect();
            const scaleX = eng.view.getScaleX();
            const scaleY = eng.view.getScaleY();
            const worldX = (x - vp.x) / scaleX;
            const worldY = (y - vp.y) / scaleY;
            const baseWorldPos = eng.v2(worldX, worldY);

            if (window.__MCP_DEBUG__) {
                try {
                    Logger.log(`[Node Picker] Input(clientX=${clientX}, clientY=${clientY}) => ScreenPt(${screenPt.x.toFixed(2)}, ${screenPt.y.toFixed(2)}) => BaseWorldPos(${baseWorldPos.x.toFixed(2)}, ${baseWorldPos.y.toFixed(2)})`);
                } catch (e) { }
            }

            let cameras = [];
            if (eng.Camera && eng.Camera.cameras) {
                cameras = eng.Camera.cameras;
            }

            // 过滤并排序相机 (排除高亮专用摄像机)
            const validCameras = [];
            for (let i = 0; i < cameras.length; i++) {
                if (cameras[i].node && cameras[i].node.name === 'InspectorCamera') continue;
                validCameras.push(cameras[i]);
            }
            const sortedCameras = validCameras.sort(function (a, b) { return b.depth - a.depth; });
            if (sortedCameras.length === 0) return null;

            // 递归拦截探测
            function walkSceneForCamera(node, camera, worldPos, depth = 0, candidates = []) {
                const indent = "  ".repeat(depth);
                const pTag = `${indent}[Walk ${depth}] ${node.name}`;

                if (eng.Scene && node instanceof eng.Scene) {
                    Logger.log(`${pTag} 开始遍历场景 Scene 根节点`);
                    const children = node.children;
                    for (let i = children.length - 1; i >= 0; i--) {
                        walkSceneForCamera(children[i], camera, worldPos, depth + 1, candidates);
                    }
                    Logger.log(`${pTag} 场景根节点遍历完毕，共收集 ${candidates.length} 个备选节点`);
                    return candidates;
                }

                Logger.log(`${pTag} 进入节点`);

                try {
                    if (node.activeInHierarchy === false) {
                        Logger.log(`${pTag} -> Return: inactiveInHierarchy`);
                        return null;
                    }
                    if (node.opacity === 0 || (node.color && node.color.a === 0)) {
                        Logger.log(`${pTag} -> Return: opacity 为 0`);
                        return null;
                    }
                } catch (e) { return null; }



                if (node.name === 'McpInspectorRoot' || node.name === 'InspectorCamera' || node.name === '__mcp_hover_overlay__' || node.name === '__mcp_select_overlay__') return null;

                // 逆后序遍历子代
                const children = node.children;
                if (children && children.length > 0) {
                    Logger.log(`${pTag} 准备遍历 ${children.length} 个子节点`);
                    for (let i = children.length - 1; i >= 0; i--) {
                        walkSceneForCamera(children[i], camera, worldPos, depth + 1, candidates);
                    }
                } else {
                    Logger.log(`${pTag} 无子节点`);
                }

                // 【核心生命线修复】千万不能移除这层 cullingMask 判定！
                // 不然如果你的拾取射线首先走过了 UI 的 MainCamera，它会带着毫无偏量矩阵的基础转换系，直接去轰炸由于镜头跟随已经发生了上千个由于世界偏离的地图对象（比如 Role/Mob）。
                // 正是因为相机组职权错乱了，才导致了所谓“虽然有跟随，但选点要在屏幕左上角一段距离才对得上的严重偏差”。
                // 只允许那个真正在管辖这个 Layer (group) 的并且拥有该相机真实世界偏转投影的摄像机对其进行判定！
                try {
                    if ((camera.cullingMask & (1 << node.groupIndex)) === 0) {
                        return candidates; // 本节点由其他组摄像机全权负责物理处理
                    }
                } catch (e) { return candidates; }

                if (node.width > 0 && node.height > 0) {

                    // 回归严格的可见实体判定：只允许真正具有渲染表现的节点碰撞
                    // 因为在 Cocos 中很多空白节点(如 Widget, 或用来遮挡穿透的空 Node) 都常被作为交互墙，
                    // 但对于“取色板”一样的屏幕拾取器而言，玩家期望点到的是人眼能“看见”的东西。
                    let hasRenderComp = false;
                    let compNames = [];

                    if (node._components) {
                        for (let k = 0; k < node._components.length; k++) {
                            const comp = node._components[k];
                            // 忽略禁用的组件
                            if (comp && comp.enabled === false) continue;
                            const compName = comp.name || (comp.constructor ? comp.constructor.name : '');
                            compNames.push(compName);
                            
                            const isRender = (eng.RenderComponent && comp instanceof eng.RenderComponent) ||
                                (compName.indexOf('Sprite') > -1 || compName.indexOf('Label') > -1 ||
                                    compName.indexOf('RichText') > -1 || compName.indexOf('Graphics') > -1 ||
                                    compName.indexOf('Skeleton') > -1 || compName.indexOf('Particle') > -1 ||
                                    compName.indexOf('Mesh') > -1 || compName.indexOf('VideoPlayer') > -1 ||
                                    compName.indexOf('WebView') > -1 || compName.indexOf('UIStaticBatch') > -1 ||
                                    compName.indexOf('Spine') > -1 || compName.indexOf('DragonBones') > -1);
                                    
                            if (isRender) {
                                // 过滤：没有赋值内容的幽灵渲染组件（如空文本或空图片）
                                if (compName.indexOf('Sprite') > -1 && (!comp.spriteFrame && !comp._spriteFrame)) continue;
                                if ((compName.indexOf('Label') > -1 || compName.indexOf('RichText') > -1) && (!comp.string || comp.string === '')) continue;
                                
                                hasRenderComp = true;
                                break;
                            }
                        }
                    }

                    if (!hasRenderComp) {
                        if (Logger.isDebug) {
                            Logger.log(`${pTag} -> 过滤: 无可见渲染组件空壳 [${compNames.join(',') || 'none'}]`);
                        }
                        // 直接返回它的子节点的候选池，它自己不再掺和拾取
                        return candidates;
                    }

                    if (typeof node.convertToNodeSpaceAR === 'function') {
                        // 兜底机制：如果相机的转换完全失效导致 worldPos = null 或等同 screenPt(如编辑器部分异常时)
                        let testPos = worldPos;

                        const localPt = node.convertToNodeSpaceAR(testPos);
                        const ax = node.anchorX !== undefined ? node.anchorX : 0.5;
                        const ay = node.anchorY !== undefined ? node.anchorY : 0.5;

                        const rectTest = eng.rect(-ax * node.width, -ay * node.height, node.width, node.height);
                        if (rectTest.contains(localPt)) {
                            if (Logger.isDebug) {
                                Logger.log(`${pTag} -> 🎯 [Hit] 命中! 加入候选池。Bounds[w=${rectTest.width}, h=${rectTest.height}]`);
                            }
                            candidates.push(node);
                        } else {
                            if (Logger.isDebug) {
                                Logger.log(`${pTag} -> [Miss] 测试未命中: LocalPt(${localPt.x.toFixed(2)}, ${localPt.y.toFixed(2)}) 不在 Bounds 内`);
                            }
                        }
                    }
                } else {
                    Logger.log(`${pTag} -> Return: 尺寸太小 (w=${node.width}, h=${node.height})`);
                }
                return candidates;
            }

            // 寻找包含点，深度遍历
            for (let c = 0; c < sortedCameras.length; c++) {
                const camera = sortedCameras[c];

                if (camera.enabled === false) continue; // ++ 新增：剔除禁用相机 ++

                let worldPos = eng.v2(baseWorldPos.x, baseWorldPos.y);

                if (typeof camera.getScreenToWorldPoint === 'function') {
                    // 重要修正：原先传入了 baseWorldPos 会导致在不同分辨率缩放和相机位移时发生二次偏移坐标。
                    // Cococs 2.x 的 getScreenToWorldPoint 预期接收最纯粹的含 viewport 尺寸内的屏幕坐标。
                    const testWorld = camera.getScreenToWorldPoint(screenPt); 
                    if (testWorld && Logger.isDebug) {
                        Logger.log(`[Camera Scan] Camera(${camera.node?camera.node.name:'NA'}) Depth:${camera.depth} => getScreenToWorldPoint(screenPt) => TestWorldPos(${testWorld.x.toFixed(2)}, ${testWorld.y.toFixed(2)})`);
                    }
                    if (testWorld) {
                        worldPos = testWorld; 
                    }
                }

                Logger.log(`[Camera Check] 最终采用 WorldPos=${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)} 进行检测`);

                // 深度优先遍历 Scene，收集所有命中的候选者
                let candidates = walkSceneForCamera(scene, camera, worldPos, 0, []);
                if (candidates && candidates.length > 0) {
                    // 对候选池进行面积权重排序（升序）。
                    // 当大面积遮罩和小按钮重叠时，由于小按钮面积更小，它会被提升到首位，从而实现完美的穿透点击。
                    candidates.sort((a, b) => {
                        const areaA = a.width * a.height;
                        const areaB = b.width * b.height;
                        return areaA - areaB;
                    });
                    
                    const result = candidates[0];
                    Logger.log(`[Picker Result] 最终候选池决选 UUID / ID: ${result.uuid || result.id} Name = ${result.name} (Area = ${result.width * result.height})`);
                    return result;
                }
            }
            return null;
        }
    };
}
