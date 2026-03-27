// 为了防止与现有的 window 冲突，封在一个 IIFE 里
(function () {
	// 幂等防护
	if ((window as any).__mcpRuntimeCrawlerInitialized) {
		return;
	}

	const POLLING_INTERVAL = 1000;

	interface IRuntimeNode {
		id: string;
		name: string;
		active: boolean;
		activeInHierarchy: boolean;
		childrenCount: number;
		components: string[];
		children: IRuntimeNode[];
		isScene: boolean;
		isPrefab: boolean;
		prefabRoot: boolean;
		prefabDepth: number;
	}

	function serializeNode(node: any, currentPrefabDepth: number = 0): IRuntimeNode | null {
		if (!node) return null;
		let isActive = true;
		let isActiveInHierarchy = true;
		let isScene = false;

		// cc.Scene 的 Getter 可能会有副作用，避开
		if (typeof (window as any).cc !== "undefined" && node instanceof (window as any).cc.Scene) {
			isActive = true;
			isActiveInHierarchy = true;
			isScene = true;
		} else {
			try {
				isActive = node.active !== false;
				isActiveInHierarchy = node.activeInHierarchy !== false;
			} catch (e) {}
		}

		let isPrefab = !!node._prefab;
		let prefabRoot = isPrefab && node._prefab.root === node;
		let nextPrefabDepth = currentPrefabDepth;
		if (prefabRoot) {
			nextPrefabDepth++;
		}

		const componentNames: string[] = [];
		if (node._components) {
			for (let i = 0; i < node._components.length; i++) {
				const comp = node._components[i];
				if (comp && comp.name) {
					let cname = comp.name;
					// 特殊处理一些内置组件名
					const match = cname.match(/<([^>]+)>/);
					if (match) cname = match[1];
					componentNames.push(cname);
				} else if (comp && comp.__classname__) {
					componentNames.push(comp.__classname__);
				} else {
					componentNames.push("UnknownComponent");
				}
			}
		}

		const data: IRuntimeNode = {
			id: node.uuid || node.id,
			name: node.name,
			active: isActive,
			activeInHierarchy: isActiveInHierarchy,
			childrenCount: node.childrenCount || 0,
			components: componentNames,
			children: [],
			isScene,
			isPrefab,
			prefabRoot,
			prefabDepth: nextPrefabDepth,
		};

		if (node.children) {
			for (let i = 0; i < node.children.length; i++) {
				const childData = serializeNode(node.children[i], nextPrefabDepth);
				if (childData) data.children.push(childData);
			}
		}
		return data;
	}

	function syncNodeTree() {
		const eng = (window as any).cc;
		if (!eng || !eng.director) return;

		const scene = eng.director.getScene();
		if (!scene) return;

		const treeData = serializeNode(scene);
		if ((window as any).__mcpInspector && (window as any).__mcpInspector.updateTree) {
			(window as any).__mcpInspector.updateTree(JSON.stringify(treeData));
		}
	}

	// ----------------- IPC 调用的暴露接口 (节点属性详情与更新) -----------------
	(window as any).__mcpCrawler = {
		debugEnabled: false,
		toggleDebugConsole: function (enabled?: boolean) {
			this.debugEnabled = enabled !== undefined ? enabled : !this.debugEnabled;
			const div = document.getElementById("mcp-debug-console");
			if (div) {
				div.style.display = this.debugEnabled ? "block" : "none";
			}
			return this.debugEnabled;
		},

		findNodeByUuid: function (uuid: string, root?: any): any {
			const eng = (window as any).cc;
			if (!eng || !eng.director) return null;
			const startNode = root || eng.director.getScene();
			if (!startNode) return null;
			if (startNode.uuid === uuid || startNode.id === uuid) return startNode;
			for (let i = 0; i < startNode.childrenCount; i++) {
				const found = this.findNodeByUuid(uuid, startNode.children[i]);
				if (found) return found;
			}
			return null;
		},

		getNodeDetail: function (uuid: string) {
			const node = this.findNodeByUuid(uuid);
			if (!node) return null;

			const detail: any = {
				id: node.uuid || node.id,
				name: node.name,
				active: node.active !== false,
				x: node.x || 0,
				y: node.y || 0,
				rotation: node.rotation !== undefined ? node.rotation : node.angle || 0,
				scaleX: node.scaleX || 1,
				scaleY: node.scaleY || 1,
				width: node.width || 0,
				height: node.height || 0,
				anchorX: node.anchorX !== undefined ? node.anchorX : 0.5,
				anchorY: node.anchorY !== undefined ? node.anchorY : 0.5,
				components: [],
			};

			// 解析组件
			if (node._components) {
				const logInfo = (msg: string) => {
					if (!(window as any).__mcpCrawler || !(window as any).__mcpCrawler.debugEnabled) {
						return; // 如果开关没开，静默且不操作 DOM
					}

					let consoleDiv = document.getElementById("mcp-debug-console");
					if (!consoleDiv) {
						consoleDiv = document.createElement("div");
						consoleDiv.id = "mcp-debug-console";
						consoleDiv.style.position = "fixed";
						consoleDiv.style.top = "10px";
						consoleDiv.style.left = "10px";
						consoleDiv.style.width = "350px";
						consoleDiv.style.height = "600px";
						consoleDiv.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
						consoleDiv.style.color = "#00FF00";
						consoleDiv.style.zIndex = "999999";
						consoleDiv.style.overflowY = "auto";
						consoleDiv.style.padding = "10px";
						consoleDiv.style.fontSize = "12px";
						consoleDiv.style.pointerEvents = "none"; // 防止遮挡游戏操作
						consoleDiv.style.whiteSpace = "pre-wrap";
						consoleDiv.style.fontFamily = "monospace";
						document.body.appendChild(consoleDiv);

						// 初始头部信息和关掉防刷屏机制
						const header = document.createElement("div");
						header.innerText = "=== MCP Inject Logs ===";
						header.style.color = "yellow";
						consoleDiv.appendChild(header);
					}

					const m = document.createElement("div");
					m.style.borderBottom = "1px solid #333";
					m.style.paddingBottom = "2px";
					m.style.marginBottom = "2px";
					m.innerText = msg;
					consoleDiv.appendChild(m);

					if (consoleDiv.childNodes.length > 200) {
						consoleDiv.removeChild(consoleDiv.childNodes[1]);
					}
					consoleDiv.scrollTop = consoleDiv.scrollHeight;

					if (typeof (window as any).Editor !== "undefined" && (window as any).Editor.info) {
						(window as any).Editor.info(msg);
					} else if (typeof (window as any).cc !== "undefined" && (window as any).cc.log) {
						(window as any).cc.log(msg);
					} else {
						console.log(msg);
					}
				};

				for (let i = 0; i < node._components.length; i++) {
					const comp = node._components[i];
					let cname = comp.name || comp.__classname__ || "UnknownComponent";
					const match = cname.match(/<([^>]+)>/);
					if (match) cname = match[1];

					const props: any[] = [];

					// 核心要求：检查并优先只暴露定义了 @property 装饰器的属性
					let propKeys: string[] = [];
					if (comp.constructor && Array.isArray(comp.constructor.__props__)) {
						propKeys = comp.constructor.__props__;
					} else {
						propKeys = Object.keys(comp);
					}

					// 引擎默认不应该在 Component 面板中显示的保留属性 (基础数据已在头部的 Node 级别展示或无视)
					const hiddenBuiltins = [
						"name",
						"uuid",
						"node",
						"enabled",
						"enabledInHierarchy",
						"_scriptAsset",
						"__scriptAsset",
						"_isOnLoadCalled",
						"_objFlags",
					];

					// 仅提取能够被呈现的基础公开属性
					for (let j = 0; j < propKeys.length; j++) {
						const key = propKeys[j];
						try {
							if (hiddenBuiltins.indexOf(key) !== -1) {
								continue;
							}

							let isVisible = true;
							// 进一步检测 Cocos Creator 的 __attrs__
							if (comp.constructor && comp.constructor.__attrs__) {
								const visibleAttr = comp.constructor.__attrs__[key + "|visible"];
								if (visibleAttr !== undefined) {
									// 如果显式定义了 visible
									if (typeof visibleAttr === "function") {
										isVisible = !!visibleAttr.call(comp);
									} else {
										isVisible = !!visibleAttr;
									}
									if (!isVisible) {
									} else {
									}
								} else {
									// 未显式定义 visible 时，下划线开头的变量默认不上 Inspector
									if (key.startsWith("_")) {
										isVisible = false;
									}
								}
							} else {
								// 退化情况：没有特性池，下划线开头一律当作私有不显示
								if (key.startsWith("_")) {
									isVisible = false;
								}
							}

							if (!isVisible) continue;

							const val = comp[key];
							if (typeof val === "function") {
								continue;
							}

							let type = "unsupported";
							let exportValue: any = val;

							if (val === null || val === undefined) {
								type = "unsupported";
							} else if (typeof val === "number") {
								type = "number";
							} else if (typeof val === "string") {
								type = "string";
							} else if (typeof val === "boolean") {
								type = "boolean";
							} else if (Array.isArray(val)) {
								type = "array";
								exportValue = val.map((item) => {
									if (item === null) return "null";
									if (item === undefined) return "undefined";
									if (
										typeof item === "number" ||
										typeof item === "string" ||
										typeof item === "boolean"
									) {
										return item;
									}
									if (item.__classname__ || item.name) {
										return `[${item.__classname__ || "对象"}] ${item.name || ""}`;
									}
									return "[复杂对象]";
								});
							}

							// 暂时只搜集这些受支持的类型回传前端
							if (type !== "unsupported") {
								props.push({ key, value: exportValue, type });
							} else {
							}
						} catch (e) {} // 屏蔽 getter 报错
					}

					detail.components.push({
						name: cname,
						properties: props,
					});
				}
			}
			return detail;
		},

		updateNodeProperty: function (uuid: string, compName: string | null, propKey: string, value: any) {
			const node = this.findNodeByUuid(uuid);
			if (!node) return false;

			if (!compName) {
				// 更新 Node 的基础属性
				if (propKey in node) {
					node[propKey] = value;
					return true;
				}
			} else {
				// 更新 Component 属性
				const comp = node.getComponent(compName);
				if (comp && propKey in comp) {
					comp[propKey] = value;
					return true;
				}
			}
			return false;
		},
	};

	function initCrawler() {
		if (typeof (window as any).cc === "undefined") {
			setTimeout(initCrawler, 500);
			return;
		}

		const eng = (window as any).cc;
		if ((window as any).__mcpInspector && (window as any).__mcpInspector.sendHandshake) {
			(window as any).__mcpInspector.sendHandshake({
				version: eng.ENGINE_VERSION,
				isNative: eng.sys.isNative,
				isMobile: eng.sys.isMobile,
				language: eng.sys.language,
			});
		}

		setInterval(syncNodeTree, POLLING_INTERVAL);
		(window as any).__mcpRuntimeCrawlerInitialized = true;
	}

	if (document.readyState === "complete" || document.readyState === "interactive") {
		initCrawler();
	} else {
		window.addEventListener("DOMContentLoaded", initCrawler);
	}
})();
