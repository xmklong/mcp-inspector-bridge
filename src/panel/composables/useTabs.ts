const { ref } = require('vue');

export function useTabs() {
    const baseTabsTemplate = [
        { id: 0, name: '节点树', icon: '🌲' },
        { id: 1, name: '开发者工具', icon: '🛠' },
        { id: 4, name: '性能分析', icon: '💡' },
        { id: 5, name: '渲染诊断', icon: '🔮' },
        { id: 2, name: 'Cocos信息', icon: 'ℹ️' },
        { id: 3, name: '扩展', icon: '🔌' },
        { id: 6, name: '设置', icon: '⚙️' }
    ];

    const loadTabsOrder = () => {
        try {
            let saved = window.localStorage.getItem('mcp-inspector-tabs-order');
            if (saved) {
                const savedIds = JSON.parse(saved);
                const finalTabs = [];
                const availableIds = new Set(baseTabsTemplate.map(t => t.id));
                for (let sid of savedIds) {
                    let found = baseTabsTemplate.find(t => t.id === sid);
                    if (found) {
                        finalTabs.push(found);
                        availableIds.delete(sid);
                    }
                }
                for (let missingId of availableIds) {
                    let found = baseTabsTemplate.find(t => t.id === missingId);
                    if (found) finalTabs.push(found);
                }
                return finalTabs;
            }
        } catch (e) { }
        return [...baseTabsTemplate];
    };

    const tabsList = ref(loadTabsOrder());
    const draggingTabId = ref(null as number | null);
    const hoverTargetId = ref(null as number | null);
    const hoverDropPos = ref(null as 'left' | 'right' | null);
    let dragSrcIndex = -1;

    const onDragStart = (tab: any, index: number, event: DragEvent) => {
        dragSrcIndex = index;
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', tab.id.toString());
        }
        setTimeout(() => {
            draggingTabId.value = tab.id;
        }, 0);
    };

    const onDragOver = (tab: any, event: DragEvent) => {
        if (draggingTabId.value === null) return;
        if (draggingTabId.value === tab.id) {
            hoverTargetId.value = null;
            hoverDropPos.value = null;
            return;
        }
        hoverTargetId.value = tab.id;
        const rect = (event.target as HTMLElement).getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        hoverDropPos.value = event.clientX < midX ? 'left' : 'right';
    };

    const onDragLeave = (tab: any, event: DragEvent) => {
        if (hoverTargetId.value === tab.id) {
            hoverTargetId.value = null;
            hoverDropPos.value = null;
        }
    };

    const onDrop = (tab: any, index: number, event: DragEvent) => {
        event.preventDefault();
        if (draggingTabId.value === null || draggingTabId.value === tab.id) {
            onDragEnd(); 
            return;
        }
        let targetIndex = index;
        if (hoverDropPos.value === 'right') {
            targetIndex++;
        }
        const movingTab = tabsList.value.splice(dragSrcIndex, 1)[0];
        if (dragSrcIndex < targetIndex) targetIndex--;
        tabsList.value.splice(targetIndex, 0, movingTab);

        try {
            const idList = tabsList.value.map((t: any) => t.id);
            window.localStorage.setItem('mcp-inspector-tabs-order', JSON.stringify(idList));
        } catch (e) { }
        onDragEnd();
    };

    const onDragEnd = () => {
        draggingTabId.value = null;
        hoverTargetId.value = null;
        hoverDropPos.value = null;
        dragSrcIndex = -1;
    };

    return {
        tabsList,
        draggingTabId,
        hoverTargetId,
        hoverDropPos,
        onDragStart,
        onDragOver,
        onDragLeave,
        onDrop,
        onDragEnd
    };
}
