# 修复横屏模式下游戏预览画面滚动条复发问题

## 背景

在 `v0.0.1` 版本中曾经修复过游戏预览区域出现滚动条的问题（详见 `UPDATE_LOG.md` 第 259-261 行）。当时的修复策略涵盖了三个层面：

1. **`useLayout.ts`**: 对 `gameContainerStyle` 中的宽高值使用 `Math.floor()` 下取整，消除亚像素浮点误差。
2. **`index.html`**: 在面板侧各层容器（`#app`、左面板、`#game-mount-wrap`、游戏容器、`<webview>`）统统加上 `overflow: hidden`。
3. **`useGameView.ts`** (L432): 在 Webview `dom-ready` 时通过 `insertCSS` 向 Cocos 预览页内部注入 CSS，强制隐藏 `html, body, .contentWrap, .content, .wrapper, #GameDiv, #GameCanvas` 的滚动条。
4. **`preload.ts`** (L15-19): 在 DOMContentLoaded 时注入样式隐藏工具栏并设置 `body, html { overflow: hidden }`。

**当前问题**：竖屏模式下表现正常（无滚动条），但切换到**横屏模式**后，游戏预览窗口再次出现水平和/或垂直滚动条。

---

## 视觉需求 (Visual Requirements)

### 目标状态
- 在**任何分辨率模式**（FIT / iPhone 7 / iPhone X / Android 1080p / iPhone 12 Pro Max）下，无论**竖屏**还是**横屏**，游戏预览区域都不应出现任何原生滚动条。
- 游戏画面应当完整铺满容器，边界 100% 纯净无杂物。

### 问题复现参照（基于用户提供截图）
| 模式 | 预期 | 实际 |
|------|------|------|
| 竖屏 (Portrait) | ✅ 无滚动条，画面纯净 | ✅ 正常 |
| 横屏 (Landscape) | ❌ 无滚动条 | ❌ 右侧/底部出现原生滚动轴 |

---

## 功能需求 (Functional Requirements)

### 1. 根因分析

横屏模式的核心差异在于 `useLayout.ts` 第 90-92 行的宽高互换：

```typescript
if (isLandscape.value) {
    const tmp = targetW; targetW = targetH; targetH = tmp;
}
```

例如选择 `750x1334` (iPhone 7)：
- **竖屏**：容器 `750 x 1334`，高度远大于宽度 → 缩放后宽度受限，Cocos 内部 canvas 不太可能溢出
- **横屏**：容器 `1334 x 750`，宽度远大于高度 → Cocos 预览页内部的 `.contentWrap` / `#GameDiv` / `#GameCanvas` 可能因为宽度极大而产生水平溢出

Cocos Creator 2.4.x 预览模板的 DOM 结构为：
```
body > .toolbar (已隐藏) > #content.content > .contentWrap > #GameDiv.wrapper > #GameCanvas
```

**内置 `style.css`** 对 `.contentWrap` 和 `.wrapper` 可能设定了基于视口的定位/尺寸规则。当横屏态下 canvas 的 **设计分辨率宽度** 大于 webview 的物理像素宽度时（因为容器经过了 CSS `transform: scale()` 缩放但 Cocos 引擎并不感知这层缩放），引擎内部会按照原始设计分辨率（如 1334px 宽）设定 canvas/wrapper 的绝对尺寸，导致溢出。

### 2. 修复方案

#### 2.1 强化 Preload CSS 注入覆盖面 (`src/preload.ts`)

当前的 preload CSS（L15-19）只处理了 `body, html` 的 overflow 和 `.content` / `.toolbar` 的布局。需要扩展覆盖到所有 Cocos 预览模板的 DOM 容器，并补充 `width`/`height` 约束：

```css
/* 原有 */
.toolbar { display: none !important; ... }
.content { top: 0px !important; bottom: 0px !important; ... height: 100% !important; }
body, html { overflow: hidden !important; ... }

/* 新增 */
.content, .contentWrap, .wrapper, #GameDiv {
    width: 100% !important;
    height: 100% !important;
    max-width: 100vw !important;
    max-height: 100vh !important;
    overflow: hidden !important;
    margin: 0 !important;
    padding: 0 !important;
    position: relative !important;
    box-sizing: border-box !important;
}
#GameCanvas {
    max-width: 100% !important;
    max-height: 100% !important;
}
/* 断绝一切 scrollbar 残余 */
*::-webkit-scrollbar {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
}
```

#### 2.2 强化 insertCSS 注入 (`src/panel/composables/useGameView.ts`)

当前 L432 行的 `insertCSS` 覆盖了 `overflow`、`margin`、`padding` 和 `::-webkit-scrollbar`，但缺少了 `width`/`height`/`max-width`/`max-height`/`box-sizing` 的约束。需要同步扩充为与 preload 一致的全量覆盖：

```typescript
gameViewDynamic.insertCSS(`
    html, body, .content, .contentWrap, .wrapper, #GameDiv {
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        height: 100% !important;
        max-width: 100vw !important;
        max-height: 100vh !important;
        box-sizing: border-box !important;
    }
    #GameCanvas {
        max-width: 100% !important;
        max-height: 100% !important;
    }
    *::-webkit-scrollbar {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
        background: transparent !important;
    }
`);
```

#### 2.3 确保面板侧容器的溢出封锁 (`src/panel/index.html`)

当前面板侧各层容器已设置 `overflow: hidden`，但需验证无遗漏。重点确认：
- `#game-mount-wrap` (L101): ✅ 已有 `overflow: hidden`
- 游戏容器 div (L104): ✅ 已有 `overflow: hidden`（静态 style + computed style）
- `<webview>` (L113): ✅ 已有 `overflow: hidden`

面板侧不需要额外改动，除非发现新的溢出层级。

### 3. 涉及文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/preload.ts` | **修改** | 扩充 DOMContentLoaded CSS 注入，覆盖所有 Cocos 预览模板容器的宽高与溢出约束 |
| `src/panel/composables/useGameView.ts` | **修改** | 扩充 `dom-ready` 时 `insertCSS` 的 CSS 规则，增加 width/height/max-width/max-height/box-sizing |
| `UPDATE_LOG.md` | **修改** | 在最新版本的缺陷修复章节中追加本次修复记录 |

---

## 边界情况 (Edge Cases)

### E1: FIT 自适应模式下的横屏
- 当选择 `FIT` 时，`gameContainerStyle` 返回 `width: 100%; height: 100%`，容器不使用绝对像素。
- 此时 Cocos 引擎将自行计算 canvas 尺寸填满 webview，需确保 CSS 约束不干扰引擎的自适应行为。
- **策略**：使用 `max-width: 100vw` / `max-height: 100vh` 而非硬性 `width: 100vw`，以保持与 FIT 模式的兼容性。

### E2: 极端缩放比例
- 如 iPhone 12 Pro Max (1284x2778) 横屏后变为 2778x1284，容器在小面板中可能被极端缩放（scale < 0.3）。
- 虽然 CSS `transform: scale()` 不影响内部布局流，但需确保 Cocos 引擎的 canvas 不会按照 2778px 原始宽创建滚动区域。
- **策略**：`width: 100% !important` 约束确保 wrapper 始终贴合 webview 边界，不论 canvas 逻辑分辨率多大。

### E3: 竖屏修复回归
- 确保本次修改不会破坏已正常工作的竖屏模式。
- **策略**：所有新增 CSS 均使用 `!important` 且为通用约束（`max-width`/`max-height`），不会限制竖屏下的正常渲染。

### E4: preload 与 insertCSS 执行时序
- `preload.ts` 的 CSS 在 `DOMContentLoaded` 时注入（早期）。
- `insertCSS` 在 `dom-ready` 时注入（晚期）。
- Cocos 引擎的 `boot.js` 可能在两者之间修改 DOM 样式。
- **策略**：双层注入形成时间夹击，确保无论引擎在何时修改样式，最终都会被 `!important` 覆盖。

### E5: 自定义预览模板
- 部分用户可能使用自定义的 preview-template，DOM 结构可能略有不同。
- **策略**：选择器同时覆盖 `class` (`.contentWrap`, `.wrapper`, `.content`) 和 `id` (`#GameDiv`, `#GameCanvas`, `#content`) 双重路径，最大化兼容性。使用通配符 `*::-webkit-scrollbar` 作为最终兜底。
