# Cocos Inspector 拾取器工作原理与多摄像机坐标映射机制

本文档总结了目前 MCP Inspector 控制台在处理 **“节点点击拾取 (Picker)”** 和 **“高亮包围框渲染 (Highlighter)”** 时的底层实现逻辑与多相机坐标系换算过程。

本模块的核心目的在解决：在 Cocos Creator 2.4.x 的运行态（含玩家镜头大范围平移）下，保证 UI 相机（不动）和 地图相机会（跟随平移）时，鼠标点击拾取与边框绘制依然能与肉眼完美贴合。

> **当前遭遇的技术痛点（向引擎大佬求助定位的方向）**：
> 在初始状态（摄像机 `x=0, y=0`）时，拾取和包围框渲染完全精准。但当游戏主相机（如负责渲染 default/Map 层）发生大范围平移时：
> 1. 点击判断区域发生了严重的漂移（鼠标点击位置与节点物理映射未成功在同一坐标域对齐）。
> 2. `Graphics` 高亮包围框也同等产生了视觉错位。

---

## 一、 鼠标点击拾取链路 (`picker.ts`)

当用鼠标在游戏视区内点击时，我们需要把鼠标在浏览器 DOM 的坐标转换为对应摄像机的真实世界坐标，然后进行矩形碰撞检测判断命中哪个节点。

### 1. 屏幕物理点归一化映射 (`screenPt`)
我们首先将 `mousedown` 时的 `clientX/clientY` 映射为等比例的纯净 Screen 坐标（Y轴向上）：
```javascript
const frameSize = cc.view.getFrameSize(); // 物理分辨率大小
const x = (clientX - rect.left) * (frameSize.width / rect.width);
const y = (rect.bottom - clientY) * (frameSize.height / rect.height);
const screenPt = cc.v2(x, y); // 标准引擎预期输入点
```

### 2. 相机矩阵空间反投影
遍历场景内活跃的多相机容器 `cc.Camera.cameras`（通过 Depth 排序从高到低）。针对当前的 `camera`，调用底层引擎 API 进行屏幕反向投影：
```javascript
// cc.Camera 原生会自动扣除 _scaleX/Y 与 Viewport 偏移，并加上自身的坐标矩阵
const testWorld = camera.getScreenToWorldPoint(screenPt); 
```

### 3. CullingMask 严格层级验证防跨维污染
由于地图相机发生平移而 UI 相机永远在原地，因此坚决不允许 UI 相机去计算地图像素，反之亦然。我们利用基于底层的 `cullingMask` 交叉校验锁定目标节点所归属的真实相机：
```javascript
// 如果该 TargetNode 的 Group 不属于当前相机的可见范围，直接跳过该相机的测试
if ((camera.cullingMask & (1 << node.groupIndex)) === 0) {
    return; 
}
```

### 4. 世界坐标转节点局部碰撞判定
对成功通过管辖校验的节点，将 `testWorld` 转换为自身坐标进行宽高测试：
```javascript
const localPt = node.convertToNodeSpaceAR(testWorld);
// 使用 node.width, node.height, anchorX, anchorY 的数学框体检测 localPt 是否在内部
```

---

## 二、 动态高亮包围框渲染链路 (`highlighter.ts`)

为了在屏幕上框选目标 `Node`，同时不破坏原生 DOM 和原有节点的父级结构，我们在最顶层创建了一个覆盖全屏的挂载了 `cc.Graphics` 的上帝面板 `InspectorRoot` (内部使用专用的正交渲染相机 `InspectorCamera`，居中锁定并独立渲染 Group)。

### 1. 提取物体世界坐标四个极点
首先计算所选节点相对于左下、右下、右上、左上的纯几何 `localCorners`，然后转为全局绝对的 `worldCorners`。
```javascript
const pt = targetNode.convertToWorldSpaceAR(corners[i]);
```

### 2. 将物体极点透过其“属主摄像机”投影回屏幕像素点
与拾取同理，先找到管辖该对象的原本摄像机 (`targetCam`)，让它自己负责把发生了自己平移矩阵的 `worldCorners` 转为屏幕坐标：
```javascript
// 该 scPt 为受 targetCam 自身各种缩放、位移等镜头属性影响后，在设备物理屏幕上实际应该出现的像素点
const scPt = targetCam.getWorldToScreenPoint(worldCorners[i]);
```

### 3. 将屏幕偏置像素，经由“高亮摄像机”回归绘制笔刷原点
由于我们的绘图笔刷节点 `cc.Graphics` 定位在了绝对 `(0,0)` 零点坐标，因此我们必须把 `scPt` 交给它的直接渲染者 `InspectorCamera` 做最后一次纯化投影：
```javascript
// 由于 InspectorCamera 在中心且 alignWithScreen=false
// 它完美反向消除这层独立画布的视图矩阵污染，使得最终的绘制纯净无瑕
const renderWorldPt = InspectorCamera.getScreenToWorldPoint(scPt);
g.lineTo(renderWorldPt.x, renderWorldPt.y); // 画笔追踪
```

---

## 三、 遗留症结探讨与大佬请教专区

当前方案在摄像机完全保持在原点 `(0, 0)` 时无懈可击。然而当含有地图等实体的游戏主相机发生追随移动（e.g. `GameCamera.x += 500`）：

**异常排查疑点一（引擎生命周期的隐性转换）：**
使用 `WorldToScreenPoint` 时，传入 `convertToWorldSpaceAR` 获取的包围框世界坐标是否被滞后了？某些跟随机制（比如用了原生跟随脚本甚至 `LateUpdate` 内重排矩阵），导致我们探针获取 `worldSpace` 的时机其实是上一帧的状态，从而产生了“移动后准星发生距离错位”？

**异常排查疑点二（相机 Scale 和 DevicePixelRatio 的倍增错位）：**
我们传入给底层的 `screenPt` 严格采用了 `frameSize` 转换。但在 Cocos Creator 不同配置下(`Fit Width / Fit Height`)，引擎源码中 `getScreenToWorldPoint(pt)` 的内部算式 `pt.x / cc.view._scaleX` 难道是对原生屏幕外设像素(DOM Client Pixel)设计的？如果传入的是 `frameSize` 的逻辑像素，是否等于遭到了 `DPR (Device Pixel Ratio)` 倍率的缩放反噬，导致平移时原本位移“1像素”，放大后却飘了“2像素”的错乱现象？

**异常排查疑点三（CullingMask 管辖权重冲突）：**
有的游戏项目中，开发者的 UI 节点可能被放在了 `default (Group 0)` 下。为了保证肉眼在引擎能看见，他们的主相机和 UI 相机的渲染 Mask 都涵盖了 `default`。如果 UI相机 深度高且覆盖 `default` 组，会导致高亮算法把原本由会追随移动的主相机负责的物体，错误发配给静态停在 `0,0` 的 UI相机投影结算，从而在视觉结果上出现彻底偏移。针对此类管辖权混乱的项目，编辑器级别的 Inspector 应采取哪种 API 能 100% 反向绑定获取节点**当前实际是由哪个 Camera 承担矩阵着色**的追踪呢？
