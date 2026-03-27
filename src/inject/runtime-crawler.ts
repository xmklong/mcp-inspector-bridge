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
        if (typeof (window as any).cc !== 'undefined' && node instanceof (window as any).cc.Scene) {
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
            prefabDepth: nextPrefabDepth
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

    function initCrawler() {
        if (typeof (window as any).cc === 'undefined') {
            setTimeout(initCrawler, 500);
            return;
        }

        const eng = (window as any).cc;
        if ((window as any).__mcpInspector && (window as any).__mcpInspector.sendHandshake) {
            (window as any).__mcpInspector.sendHandshake({
                version: eng.ENGINE_VERSION,
                isNative: eng.sys.isNative,
                isMobile: eng.sys.isMobile,
                language: eng.sys.language
            });
        }

        setInterval(syncNodeTree, POLLING_INTERVAL);
        (window as any).__mcpRuntimeCrawlerInitialized = true;
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initCrawler();
    } else {
        window.addEventListener('DOMContentLoaded', initCrawler);
    }
})();
