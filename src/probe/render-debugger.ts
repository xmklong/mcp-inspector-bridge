// @ts-nocheck
export function initRenderDebugger() {
            window.__mcpRenderDebuggerHook = {
                _isActive: false,
                _originBatcherAddQuad: null,
                _originPushRenderCommand: null,
                _lastPushedNodeName: "Unknown Node",
                _lastQuadInfo: null,

                // --- Frame Snapshot Data ---
                _frames: [],
                _maxFrames: 5,
                _currentFrame: null,
                _isCaptureEnabled: true,
                _originMainLoop: null,
                _originBatcherFlush: null,
                _originDeviceDraw: null,
                _lastSnapshotSendTime: 0,

                // --- 画面重绘回放 ---
                _replayLimit: -1,
                _currentReplayDrawCallCount: 0,
                _requestCaptureThisFrame: false,
                _pendingCommands: [], // 收集发往下一个 DrawCall 的 Command 详情
                _tempBatchesData: [[]], // 存储同步批处理的数据分片
                _currentMcpBatchIndex: 0, // 当前数据分片游标
                _isFlushingBatcher: false,
                _currentFlushingBatchIndex: 0,
                _currentFlushingBatcher: null,

                stepToDrawCall: function (limitIndex: number, frameSnapshotData: any) {
                    this._replayLimit = limitIndex;
                    this._requestCaptureThisFrame = true;
                    // 尝试促使引擎渲染
                    const eng = window.cc || window.editorEngine;
                    if (eng && eng.director && eng.director.isPaused()) {
                        // 强制触发一次绘制以便我们能捕获
                        eng.director.mainLoop(eng.director._deltaTime);
                    }
                },

                injectHooks: function () {
                    const self = this;
                    if (self._isActive) return;

                    let eng: any = null;
                    try {
                        const frm = document.getElementById('GameDiv') as HTMLIFrameElement;
                        if (frm && frm.contentWindow && (frm.contentWindow as any).cc) {
                            eng = (frm.contentWindow as any).cc;
                        }
                    } catch (e) { }
                    if (!eng) eng = window.cc;

                    if (!eng || !eng.RenderComponent) {
                        console.warn("[RenderDebugger] 初始化失败：未找到 cc.RenderComponent");
                        return;
                    }

                    // Cocos 2.4 引擎真实拼写错误：_checkBacth 而非 _checkBatch
                    const methodName = typeof eng.RenderComponent.prototype._checkBacth === 'function' ? '_checkBacth' : '_checkBatch';

                    if (typeof eng.RenderComponent.prototype[methodName] !== 'function') {
                        console.warn(`[RenderDebugger] 无法定位合批检测函数：${methodName}() 不存在`);
                        return;
                    }

                    if (!self._originCheckBatch) {
                        self._originCheckBatch = eng.RenderComponent.prototype[methodName];
                    }

                    eng.RenderComponent.prototype[methodName] = function (batcher: any, cullingMask: number) {
                        if (self._isActive && batcher) {
                            try {
                                const newMaterial = this._materials && this._materials.length > 0 ? this._materials[0] : null;
                                if (newMaterial && batcher.material) {
                                    const newHash = newMaterial.getHash();
                                    const oldHash = batcher.material.getHash();

                                    if (newHash !== oldHash || batcher.cullingMask !== cullingMask) {
                                        if (batcher.material.name !== 'default-material' && batcher.node && batcher.node !== batcher._dummyNode) {
                                            const diffs = [];
                                            if (newMaterial.name !== batcher.material.name) {
                                                diffs.push(`材质实例不同 [${batcher.material.name} -> ${newMaterial.name}]`);
                                            } else if (newHash !== oldHash) {
                                                diffs.push(`材质内部参数变动 (疑似纹理或合批未开)`);
                                            }
                                            if (batcher.cullingMask !== cullingMask) {
                                                diffs.push(`Culling Mask 变动 [${batcher.cullingMask} -> ${cullingMask}]`);
                                            }

                                            const culpritNode = this.node;
                                            const victimNode = batcher.node;

                                            const culpritName = culpritNode ? culpritNode.name : 'Unknown';
                                            const victimName = victimNode ? victimNode.name : 'Unknown';
                                            const culpritId = culpritNode ? (culpritNode.uuid || culpritNode.id || '') : '';
                                            const victimId = victimNode ? (victimNode.uuid || victimNode.id || '') : '';

                                            // 完全静默原生控制台，废弃控制台警告直出时代的过渡代码：
                                            // console.warn(\`[RenderDebugger] 🚫 <合批被迫中断> ...\`);

                                            // 阶段一改造：增加前缀 JSON 以向外广播
                                            const payload = {
                                                type: 'render-debugger:batch-break',
                                                data: {
                                                    culprit: culpritName,
                                                    culpritId: culpritId,
                                                    victim: victimName,
                                                    victimId: victimId,
                                                    reasons: diffs
                                                }
                                            };

                                            // [真正静默模式]：寻找宿主 IPC 专线投递避免污染 Console
                                            if (window.__mcpInspector && window.__mcpInspector.sendRenderDebuggerPayload) {
                                                window.__mcpInspector.sendRenderDebuggerPayload(payload);
                                            } else {
                                                console.debug(`[RenderDebugger]JSON_DATA:${JSON.stringify(payload)}`);
                                            }
                                        }
                                    }
                                }
                            } catch (e) { }

                        }
                        const ret = self._originCheckBatch.call(this, batcher, cullingMask);

                        // [Phase 4] 收集参与当前正在合批的渲染指令参数
                        if (self._isActive && self._isCaptureEnabled && self._currentFrame) {

                            if (batcher && !batcher.__mcp_execute_hooked) {
                                batcher.__mcp_execute_hooked = true;
                                const hookMethod = function (origFunc) {
                                    if (!origFunc) return origFunc;
                                    return function () {
                                        let ret;
                                        // 标记当前 Batcher 正在排放 DrawCall
                                        if (self._isActive && self._isCaptureEnabled && self._currentFrame) {
                                            self._currentFlushingBatcher = this;
                                            this.__mcp_flushing_index = 0;
                                        }
                                        ret = origFunc.apply(this, arguments);
                                        // 排放结束，重置并清空数据
                                        if (self._isActive && self._isCaptureEnabled && self._currentFrame) {
                                            if (self._currentFlushingBatcher === this) {
                                                self._currentFlushingBatcher = null;
                                            }
                                            this.__mcp_temp_batches = [];
                                        }
                                        return ret;
                                    };
                                };
                                if (batcher.execute) batcher.execute = hookMethod(batcher.execute);
                                if (batcher.flush) batcher.flush = hookMethod(batcher.flush);
                            }

                            let mat = this._materials && this._materials.length > 0 ? this._materials[0] : null;
                            let matHash = mat ? mat.getHash() : 'N/A';
                            let bSrc = mat ? mat.getProperty('blendSrc') : undefined;
                            let bDst = mat ? mat.getProperty('blendDst') : undefined;

                            // 回退拾取：常规组件如果材质取不到则读取组件私有混合模式属性
                            if (bSrc === undefined && this.srcBlendFactor !== undefined) bSrc = this.srcBlendFactor;
                            if (bDst === undefined && this.dstBlendFactor !== undefined) bDst = this.dstBlendFactor;

                            // 嗅探并动态拦截 CC 2.4 所用 Batcher 的各种底层 Flush 变体函数
                            // 只要底层执行了上传派发缓存区，我们就严格闭合当前的组件槽并开启下一个插槽
                            ['flush', '_flush', '_flushIA', '_flushMaterial'].forEach(fn => {
                                if (typeof batcher[fn] === 'function' && !batcher['__mcp_' + fn + '_hooked']) {
                                    batcher['__mcp_' + fn + '_hooked'] = true;
                                    let oldFn = batcher[fn];
                                    batcher[fn] = function () {
                                        if (self._isActive && self._isCaptureEnabled && self._currentFrame) {
                                            // Guard 验证：防止嵌套 flush 导致越级空包
                                            if (self._tempBatchesData[self._currentMcpBatchIndex] && self._tempBatchesData[self._currentMcpBatchIndex].length > 0) {
                                                self._currentMcpBatchIndex++;
                                                self._tempBatchesData[self._currentMcpBatchIndex] = [];
                                            }
                                        }
                                        return oldFn.apply(this, arguments);
                                    };
                                }
                            });

                            if (typeof self._currentMcpBatchIndex !== 'number') {
                                self._currentMcpBatchIndex = 0;
                            }
                            let targetBatchIndex = self._currentMcpBatchIndex;

                            if (!self._tempBatchesData[targetBatchIndex]) {
                                self._tempBatchesData[targetBatchIndex] = [];
                            }

                            self._tempBatchesData[targetBatchIndex].push({
                                id: self._tempBatchesData[targetBatchIndex].length,
                                type: this.__classname__ || this.constructor.name || 'Component',
                                name: this.node ? this.node.name : 'Unknown',
                                nodeUuid: this.node ? (this.node.uuid || this.node.id) : '',
                                materialHash: matHash,
                                blendSrc: bSrc,
                                blendDst: bDst
                            });
                        }
                        return ret;
                    };

                    // --- 1. mainLoop 钩子 (帧起始/结束) ---
                    if (!self._originMainLoop && eng.Director && eng.Director.prototype.mainLoop) {
                        self._originMainLoop = eng.Director.prototype.mainLoop;
                        eng.Director.prototype.mainLoop = function (dt: number) {
                            self._currentReplayDrawCallCount = 0; // 起始重置计数

                            if (self._isActive && self._isCaptureEnabled) {
                                self._currentFrame = {
                                    frameId: eng.director.getTotalFrames(),
                                    timestamp: performance.now(),
                                    drawCalls: [],
                                    totalQuads: 0,
                                    totalVertices: 0,
                                    totalDrawCalls: 0
                                };
                                self._pendingCommands = [];
                                self._tempBatchesData = [[]];
                                self._currentMcpBatchIndex = 0;
                                self._isFlushingBatcher = false;
                            }

                            self._originMainLoop.call(this, dt);

                            // 回读截屏 (在原本渲染循环刚完毕尚未交换走 Buffer 时提取)
                            if (self._requestCaptureThisFrame) {
                                self._requestCaptureThisFrame = false;
                                try {
                                    const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
                                    if (canvas) {
                                        const base64 = canvas.toDataURL('image/jpeg', 0.8);
                                        const payload = {
                                            type: 'render-debugger:replay-result',
                                            data: base64
                                        };
                                        if (window.__mcpInspector && window.__mcpInspector.sendRenderDebuggerPayload) {
                                            window.__mcpInspector.sendRenderDebuggerPayload(payload);
                                        }
                                    }
                                } catch (err) {
                                    console.error("[RenderDebugger] 画布回读失败: ", err);
                                }
                            }

                            if (self._isActive && self._isCaptureEnabled && self._currentFrame) {
                                self._frames.push(self._currentFrame);
                                if (self._frames.length > self._maxFrames) {
                                    self._frames.shift();
                                }

                                // 节流发送快照 (500ms 一次)
                                const now = performance.now();
                                if (!self._lastSnapshotSendTime || now - self._lastSnapshotSendTime > 500) {
                                    self._lastSnapshotSendTime = now;
                                    const payload = {
                                        type: 'render-debugger:snapshot',
                                        data: self._currentFrame
                                    };
                                    if (window.__mcpInspector && window.__mcpInspector.sendRenderDebuggerPayload) {
                                        window.__mcpInspector.sendRenderDebuggerPayload(payload);
                                    } else {
                                        // 兼容降级模式，由宿主主动拦截 console
                                        console.debug(`[RenderDebugger]JSON_DATA:${JSON.stringify(payload)}`);
                                    }
                                }

                                self._currentFrame = null;
                            }
                        };
                    }

                    // 废弃对 pushRenderCommand 的旧版本粗粒度拦截（因为我们现在要在 draw 阶段与 checkBacth 中精确挂载 commands）
                    /*
                    if (!self._originPushRenderCommand && eng.renderer) {
                        self._originPushRenderCommand = eng.renderer.pushRenderCommand;
                        eng.renderer.pushRenderCommand = function(cmd: any) {
                            if (self._originPushRenderCommand) {
                                return self._originPushRenderCommand.call(this, cmd);
                            }
                        };
                    }
                    */

                    // --- 3. flush 和 draw 钩子 (最终 DrawCall) ---
                    if (eng.renderer && eng.renderer._batcher) {
                        if (!self._originBatcherFlush) {
                            self._originBatcherFlush = eng.renderer._batcher.flush;
                            eng.renderer._batcher.flush = function () {
                                let ret;
                                if (self._isActive && self._isCaptureEnabled && self._currentFrame) {
                                    self._isFlushingBatcher = true;
                                    self._currentFlushingBatchIndex = 0;
                                }
                                if (self._originBatcherFlush) {
                                    ret = self._originBatcherFlush.apply(this, arguments);
                                }
                                if (self._isActive && self._isCaptureEnabled && self._currentFrame) {
                                    self._isFlushingBatcher = false;
                                    // 仅防守，交由具体的 execute/flush hook 清除较为保险，这里也可清
                                    self._tempBatchesData = [];
                                }
                                return ret;
                            };
                        }
                    }

                    // Hook ForwardRenderer._draw to capture exact Item context
                    if (eng.renderer && eng.renderer._forward && eng.renderer._forward.constructor && eng.renderer._forward.constructor.prototype) {
                        if (!self._originForwardDraw) {
                            self._originForwardDraw = eng.renderer._forward.constructor.prototype._draw;
                            if (self._originForwardDraw) {
                                eng.renderer._forward.constructor.prototype._draw = function (item) {
                                    self._currentRenderItem = item;
                                    let ret = self._originForwardDraw.apply(this, arguments);
                                    self._currentRenderItem = null;
                                    return ret;
                                };
                            }
                        }
                    }

                    if (eng.gfx && eng.gfx.Device) {
                        if (!self._originDeviceDraw) {
                            self._originDeviceDraw = eng.gfx.Device.prototype.draw;
                            eng.gfx.Device.prototype.draw = function (primitiveType: number, indicesStart: number, indicesCount: number) {

                                // 处理 CC 2.4 中底层重载调用 draw(start, count) 的边界情况
                                let realPrimType = 4; // PT_TRIANGLES 默认为 4
                                let realIndCount = 0;
                                if (arguments.length >= 3) {
                                    realPrimType = arguments[0];
                                    realIndCount = arguments[2];
                                } else if (arguments.length === 2) {
                                    realIndCount = arguments[1];
                                }

                                // 限制回放阶段的超量渲染
                                if (self._replayLimit !== -1) {
                                    if (self._currentReplayDrawCallCount > self._replayLimit) {
                                        self._currentReplayDrawCallCount++;
                                        return; // 跨阶物理抛弃渲染指令
                                    }
                                }
                                if (self._isActive && self._isCaptureEnabled && self._currentFrame) {
                                    let activeCommands = [];

                                    // 基于管线的分离式遍历与集中式消费特征：逐批次消费
                                    if (self._tempBatchesData && self._tempBatchesData.length > 0) {
                                        activeCommands = self._tempBatchesData.shift() || [];
                                    }

                                    if (!activeCommands || activeCommands.length === 0) {
                                        activeCommands = self._pendingCommands;
                                        self._pendingCommands = [];

                                        // 兜底策略：如果存在通过 ForwardRenderer._draw 直接派发的 item，解析其从属 Node
                                        if (self._currentRenderItem && activeCommands.length === 0) {
                                            let nodeObj = self._currentRenderItem.node;
                                            if (!nodeObj && self._currentRenderItem.model) {
                                                nodeObj = self._currentRenderItem.model.node;
                                            }
                                            if (nodeObj) {
                                                activeCommands.push({
                                                    id: 0,
                                                    type: 'RenderItem',
                                                    name: nodeObj.name || 'Unknown',
                                                    nodeUuid: nodeObj.uuid || nodeObj.id || ''
                                                });
                                            }
                                        }
                                    }

                                    self._currentFrame.drawCalls.push({
                                        id: self._currentFrame.drawCalls.length,
                                        type: 'draw',
                                        primitiveType: realPrimType,
                                        indiceCount: realIndCount,
                                        vertexCount: Math.floor(realIndCount / 1.5), // 粗略估算四边形的顶点数
                                        timestamp: performance.now(),
                                        commands: activeCommands
                                    });
                                    self._currentFrame.totalDrawCalls++;
                                }

                                self._currentReplayDrawCallCount++;

                                if (self._originDeviceDraw) {
                                    return self._originDeviceDraw.apply(this, arguments);
                                }
                            };
                        }
                    }

                    self._isActive = true;
                    console.log("[RenderDebugger] MVP 探针已成功注入游戏内渲染管线 ✅");
                },

                restoreHooks: function () {
                    const self = this;
                    if (!self._isActive) return;

                    let eng: any = null;
                    try {
                        const frm = document.getElementById('GameDiv') as HTMLIFrameElement;
                        if (frm && frm.contentWindow && (frm.contentWindow as any).cc) {
                            eng = (frm.contentWindow as any).cc;
                        }
                    } catch (e) { }

                    if (!eng) {
                        eng = window.cc;
                    }

                    if (eng && eng.RenderComponent && self._originCheckBatch) {
                        const methodName = typeof eng.RenderComponent.prototype._checkBacth === 'function' ? '_checkBacth' : '_checkBatch';
                        eng.RenderComponent.prototype[methodName] = self._originCheckBatch;
                    }
                    if (self._originMainLoop && eng.Director) {
                        eng.Director.prototype.mainLoop = self._originMainLoop;
                        self._originMainLoop = null;
                    }
                    if (self._originPushRenderCommand && eng.renderer) {
                        eng.renderer.pushRenderCommand = self._originPushRenderCommand;
                        self._originPushRenderCommand = null;
                    }
                    if (self._originBatcherFlush && eng.renderer && eng.renderer._batcher) {
                        eng.renderer._batcher.flush = self._originBatcherFlush;
                        self._originBatcherFlush = null;
                    }
                    if (self._originDeviceDraw && eng.gfx && eng.gfx.Device) {
                        eng.gfx.Device.prototype.draw = self._originDeviceDraw;
                        self._originDeviceDraw = null;
                    }

                    self._lastQuadInfo = null;
                    self._frames = [];
                    self._currentFrame = null;
                    self._isActive = false;
                    self._replayLimit = -1;
                    self._currentReplayDrawCallCount = 0;
                    self._currentMcpBatchIndex = 0;
                    self._isFlushingBatcher = false;
                    console.log("[RenderDebugger] MVP 探针已安全撤出，游戏内归还原生管线 🛑");
                }
            };
}
