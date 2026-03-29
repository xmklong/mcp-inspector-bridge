const { ref, watch, onMounted, onUnmounted } = require('vue');
declare const Editor: any;

export const RenderDebugger = {
    template: `
        <div style="padding: 15px; color: #eee; font-family: sans-serif; display: flex; flex-direction: column; height: 100%; box-sizing: border-box;">
            <div style="flex-shrink: 0; margin-bottom:  १५px;">
                <h3 style="margin-top: 0; color: #fff;">渲染合批大盘诊断</h3>
                <p style="font-size: 12px; color: #aaa; margin-bottom: 10px;">
                    嗅探导致 <strong>DrawCall 合批断流的根因</strong>。为了防刷屏崩溃，相同节点和原因的打断仅增加计数徽章。
                </p>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <label style="display: flex; align-items: center; cursor: pointer; background: #333; padding: 6px 12px; border-radius: 4px; border: 1px solid #555;">
                        <input type="checkbox" v-model="isCapturing" style="margin-right: 8px;" />
                        <span style="font-size: 13px; font-weight: bold;" :style="{ color: isCapturing ? '#4caf50' : '#ccc' }">
                            {{ isCapturing ? '诊断中...' : '开启诊断' }}
                        </span>
                    </label>
                    <button @click="clearLogs" style="padding: 6px 12px; background: #444; color: #fff; border: 1px solid #555; border-radius: 4px; cursor: pointer; font-size: 12px;">
                        🗑 清空诊断日志
                    </button>
                    <span v-if="batchBreakRecords.length > 0" style="font-size: 12px; color: #888;">
                        捕获到 {{ batchBreakRecords.length }} 种断批模式 (总命中: {{ totalHits }})
                    </span>
                </div>
            </div>

            <!-- 数据列表示图 -->
            <div style="flex: 1; min-height: 0; border: 1px solid #333; background: #1a1a1c; overflow-y: auto; border-radius: 4px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                    <thead style="position: sticky; top: 0; background: #2a2a2a; color: #ccc; z-index: 10;">
                        <tr>
                            <th style="padding: 6px;">打断节点 (Culprit)</th>
                            <th style="padding: 6px;">上游节点 (Victim)</th>
                            <th style="padding: 6px;">断批特征原因</th>
                            <th style="padding: 6px; width: 60px;">频次</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="record in batchBreakRecords" :key="record.hashKey" style="border-bottom: 1px dashed #333;">
                            <td style="padding: 6px; color: #ff5252; font-weight: bold;">
                                {{ record.culprit }}
                                <span v-if="record.culpritId" @click="locateNode(record.culpritId)" style="cursor: pointer; margin-left: 4px; border: 1px solid #ff5252; padding: 0 4px; border-radius: 3px; font-size: 10px; opacity: 0.8;" title="点击定位节点">📌</span>
                            </td>
                            <td style="padding: 6px; color: #81d4fa;">
                                {{ record.victim }}
                                <span v-if="record.victimId" @click="locateNode(record.victimId)" style="cursor: pointer; margin-left: 4px; border: 1px solid #81d4fa; padding: 0 4px; border-radius: 3px; font-size: 10px; opacity: 0.8;" title="点击定位节点">📌</span>
                            </td>
                            <td style="padding: 6px; color: #e0e0e0;">
                                <div v-for="(rs, idx) in record.reasons" :key="idx" style="margin-bottom: 2px;">• {{ rs }}</div>
                            </td>
                            <td style="padding: 6px;">
                                <span style="background: #e65100; color: #fff; padding: 2px 6px; border-radius: 10px; font-size: 11px;">
                                    x{{ record.hitCount }}
                                </span>
                            </td>
                        </tr>
                        <tr v-if="batchBreakRecords.length === 0">
                            <td colspan="4" style="text-align: center; padding: 30px; color: #666;">
                                {{ isCapturing ? '侦听中... 尚未捕获到断批事件' : '请开启诊断开关开始捕获' }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `,
    emits: ['toggle', 'locate-node'],
    setup(props: any, { emit }: any) {
        const isCapturing = ref(false);
        const batchBreakRecords = ref([]);
        const totalHits = ref(0);

        const clearLogs = () => {
            batchBreakRecords.value = [];
            totalHits.value = 0;
        };

        const locateNode = (id: string) => {
            if (id) emit('locate-node', id);
        };

        const onPayloadReceived = (e: any) => {
            if (!isCapturing.value) return;
            const payload = e.detail;
            if (!payload || !payload.data) return;

            const { culprit, culpritId, victim, victimId, reasons } = payload.data;
            const reasonsStr = (reasons || []).join('#');
            const hashKey = culprit + '||' + victim + '||' + reasonsStr;

            // 寻找去重记录
            const existing = batchBreakRecords.value.find((r: any) => r.hashKey === hashKey);
            
            if (existing) {
                existing.hitCount++;
            } else {
                // 如果数量超过 200 条，保护性摘除最早的
                if (batchBreakRecords.value.length >= 200) {
                    batchBreakRecords.value.shift();
                }
                batchBreakRecords.value.push({
                    hashKey,
                    culprit,
                    culpritId,
                    victim,
                    victimId,
                    reasons: reasons || [],
                    hitCount: 1
                } as never);
            }
            totalHits.value++;
        };

        onMounted(() => {
            window.addEventListener('render-debugger-payload', onPayloadReceived as EventListener);
        });

        onUnmounted(() => {
            window.removeEventListener('render-debugger-payload', onPayloadReceived as EventListener);
        });

        watch(isCapturing, (newVal: boolean) => {
            if (newVal) clearLogs(); // 每次重新开启时自动清空
            emit('toggle', newVal);
        });

        return {
            isCapturing,
            batchBreakRecords,
            totalHits,
            clearLogs,
            locateNode
        };
    }
};
