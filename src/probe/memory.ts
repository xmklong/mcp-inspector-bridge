// @ts-nocheck
export function initMemory() {
    // 极值存储器，寿命贯穿探针全程
    const memExtrema = {};

    window.__mcpGetMemoryRanking = function () {
        const eng = window.cc;
        if (!eng || !eng.assetManager || !eng.assetManager.assets) return null;

        const assets = eng.assetManager.assets;
        const bundles = eng.assetManager.bundles; // Map<string, Bundle> (2.4+)

        const globalResources = [];
        const bundleDataMap = {};
        const ownerMap = {}; // texture uuid -> list of parent asset names

        // Pass 1: 建立纹理归属反向映射表
        if (assets.forEach) {
            assets.forEach((asset, auuid) => {
                if (!asset) return;
                try {
                    if ((asset.constructor && asset.constructor.name === 'SpriteFrame') || (eng.SpriteFrame && asset instanceof eng.SpriteFrame)) {
                        let tex = asset._texture;
                        if (!tex && typeof asset.getTexture === 'function') tex = asset.getTexture();
                        if (tex) {
                            let tid = tex._uuid || tex.id || tex._id;
                            if (tid) {
                                if (!ownerMap[tid]) ownerMap[tid] = [];
                                let sName = asset.name || asset._name;
                                if (sName && sName !== 'Unnamed' && sName.indexOf(auuid.substring(0, 8)) === -1 && ownerMap[tid].indexOf(sName) === -1) {
                                    ownerMap[tid].push(sName);
                                }
                            }
                        }
                    }
                } catch (e) { }
            });
        }

        // 1. 初始化存在的 bundle 容器
        if (bundles && bundles.forEach) {
            bundles.forEach((bundle, name) => {
                bundleDataMap[name] = { name: name, currentMemory: 0, resources: [] };
            });
        } else if (bundles) {
            // Fallback for older maps or undefined
            for (let name in bundles) {
                if (typeof bundles[name] === 'object') {
                    bundleDataMap[name] = { name: name, currentMemory: 0, resources: [] };
                }
            }
        }

        // 虚拟兜底区
        bundleDataMap['[Internal/Global]'] = { name: '[Internal/Global]', currentMemory: 0, resources: [] };

        // 辅助函数，粗略或精确的计算单个资源的内存字节数
        function getAssetSize(asset) {
            if (!asset) return 0;
            // 若有原生标记则非常准确
            if (asset._nativeSize !== undefined) return asset._nativeSize;
            if (asset._nativeAsset && asset._nativeAsset.byteLength) return asset._nativeAsset.byteLength;

            let cName = '';
            if (asset.__classname__) {
                cName = asset.__classname__;
            } else if (eng.js && typeof eng.js.getClassName === 'function') {
                cName = eng.js.getClassName(asset) || '';
            }
            const typeStr = cName || (asset.constructor ? asset.constructor.name : 'Unknown');

            if (typeStr.indexOf('Texture2D') !== -1 || (eng.Texture2D && asset instanceof eng.Texture2D)) {
                const w = asset.width || 0;
                const h = asset.height || 0;
                let bpp = 4; // 默认 rgba8888 估算
                return w * h * bpp;
            }
            if ((typeStr.indexOf('AudioClip') !== -1 || (eng.AudioClip && asset instanceof eng.AudioClip)) && asset._duration) {
                // 预估 128kbps 的音频在解压时的体积 (简单粗暴的下限预估)
                return Math.floor(asset._duration * 128 * 1024 / 8);
            }
            if (typeStr.indexOf('SpriteFrame') !== -1 || (eng.SpriteFrame && asset instanceof eng.SpriteFrame)) {
                // 引用类资源，其巨大内存本身落在依存的 Texture(图集) 上，切勿重复累积大片 Bytes 导致虚高
                return 128; // 元数据占位
            }
            if (typeStr.indexOf('Skeleton') !== -1 || (eng.sp && eng.sp.SkeletonData && asset instanceof eng.sp.SkeletonData)) {
                return 2048; // JSON 骨骼点及拓扑
            }
            return 512; // 其他微型资源：Prefab/Material/Effect 等
        }

        // 2. 遍历所有存活 asset
        if (assets.forEach) {
            assets.forEach((asset, uuid) => {
                if (!asset) return;

                let typeName = (asset.constructor && asset.constructor.name) || (asset.__classname__) || 'Asset';
                // cc.js.getClassName 更好
                if (eng.js && typeof eng.js.getClassName === 'function') {
                    const cName = eng.js.getClassName(asset);
                    if (cName) typeName = cName;
                }

                // 优先寻找它的 Bundle 归属与原生构建路径 (大幅降低大批 Unnamed 现象)
                let foundBundle = false;
                let bNameTarget = '[Internal/Global]';
                let bundleInfoPath = '';

                if (bundles && bundles.forEach) {
                    bundles.forEach((bundle, bName) => {
                        if (!foundBundle && bundle.getAssetInfo) {
                            const info = bundle.getAssetInfo(uuid);
                            if (info) {
                                foundBundle = true;
                                bNameTarget = bName;
                                if (info.path) {
                                    const parts = info.path.split(/[\/\\]/);
                                    bundleInfoPath = parts[parts.length - 1];
                                }
                            }
                        }
                    });
                }

                // 多级名称回落策略与污染判定
                function isUselessName(n, u) {
                    if (!n) return true;
                    if (n === 'Unnamed' || n === 'Unknown') return true;
                    const shortU = u.substring(0, 8);
                    // 包含了原资产 UUID 截断序列的名称往往是引擎底层生成的临时无意义名
                    if (n.indexOf(shortU) !== -1) return true;
                    if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-/.test(n)) return true;
                    return false;
                }

                let name = bundleInfoPath;
                if (isUselessName(name, uuid)) name = asset.name || asset._name;
                if (isUselessName(name, uuid)) {
                    if (asset.nativeUrl) {
                        const urlParts = String(asset.nativeUrl).split(/[\/\\]/);
                        name = urlParts[urlParts.length - 1]; // 通常是 xxxxxxxx.png，但可能被上方的 shortU 拦下来
                    }
                }

                // 依然无意义？使用反向扫描探测到的拥有者名字 (针对依附对象提取)
                if (isUselessName(name, uuid) && ownerMap[uuid] && ownerMap[uuid].length > 0) {
                    name = '[Tex] ' + ownerMap[uuid][0]; // 借用父层名字
                }

                if (isUselessName(name, uuid)) {
                    name = '[Unnamed] ' + uuid.substring(0, 8);
                }

                const refCount = asset.refCount || 0;
                const size = getAssetSize(asset);

                const resItem = {
                    id: uuid,
                    name: name,
                    type: typeName,
                    memory: size,
                    refCount: refCount
                };

                if (bundleDataMap[bNameTarget]) {
                    bundleDataMap[bNameTarget].resources.push(resItem);
                    bundleDataMap[bNameTarget].currentMemory += size;
                }
            });
        }

        // 3. 构建返回列表、排序，并更新极值记录
        const resultList = [];
        const allRes = [];

        for (let bName in bundleDataMap) {
            const block = bundleDataMap[bName];

            if (!memExtrema[bName]) {
                memExtrema[bName] = { max: block.currentMemory, min: block.currentMemory };
            } else {
                // Min 处理：因为初始化或全空期间可能是0，碰到真实有效波谷时才拉低
                if (memExtrema[bName].min === 0 && block.currentMemory > 0) {
                    memExtrema[bName].min = block.currentMemory;
                } else if (block.currentMemory < memExtrema[bName].min && block.currentMemory > 0) {
                    memExtrema[bName].min = block.currentMemory;
                }
                // Max 无脑上抬
                if (block.currentMemory > memExtrema[bName].max) {
                    memExtrema[bName].max = block.currentMemory;
                }
            }

            block.maxMemory = memExtrema[bName].max;
            block.minMemory = memExtrema[bName].min;
            block.resourceCount = block.resources.length;

            // Bundle 内部局部倒序
            block.resources.sort((a, b) => b.memory - a.memory);

            // 收集汇总
            for (let i = 0; i < block.resources.length; i++) {
                allRes.push(block.resources[i]);
            }

            resultList.push(block);
        }

        // 全景榜单倒序
        allRes.sort((a, b) => b.memory - a.memory);

        return {
            bundles: resultList,
            allResources: allRes
        };
    };
}
