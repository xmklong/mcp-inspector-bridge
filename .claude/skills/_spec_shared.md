# Spec 工作流共享标准

本文件定义 `/spec:*` 命令族的公共约束，被各 skill 引用。

---

## 语言红线

**绝对强制**：所有 AI 输出、文档内容、代码注释 (DocStrings / 行内注释)、Git 提交信息（含 `feat`/`fix` 标头）均必须且只能使用 **简体中文 (Simplified Chinese)**。

## 技术栈约束（源自 `memory/constitution.md`）

- **运行时**: Cocos Creator 2.4.x Extension / Electron（主进程）/ Vue.js 3 + HTML 拼接（前端面板）/ IPC 桥接
- **脚本语言**: 所有新创建或重构的脚本必须使用 TypeScript (`.ts`)，严厉禁止新增 `.js` 裸文件
- **架构**: 优先复用现有 managers、utils、base classes，禁止未经授权引入重型第三方依赖
- **环境隔离**: `src/scene-script.ts` 仅用于编辑器原生窗口操作，游戏运行时探针注入 `src/probe.ts`，由 `src/preload.ts` 挂载至 Webview

## 产物路径约定

```
specs/[feature_name]/spec.md          # 功能规范
specs/[feature_name]/plan.md          # 实施计划
specs/[feature_name]/verify_report.md # 验证报告
```

## 编译铁律

1. 修改任何 TypeScript 源码后，必须执行 `npm run build`
2. 编译失败 → 立即根据报错修复 → 重新执行 `npm run build`
3. 重复直到编译通过后才能继续后续步骤
4. 最多重试 3 次，超过则输出完整错误摘要并请求用户介入

## 文件路径格式

- `file:///` 可点击链接格式：`[文件名:L行号](file:///绝对路径#L行号)`
- 绝对路径从工具返回值中获取，反斜杠替换为正斜杠
- 示例：`[index.html:L78](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/index.html#L78)`

## UPDATE_LOG.md 格式规范

- 版本章节结构：`## [版本号] - 日期` → `### ✨ 新特性` → `### 🐛 缺陷修复` → `### 🧹 代码整理`
- 版本之间用 `---` 分隔
- 禁止花哨修辞、禁止单条超 5 行、禁止在修复描述中嵌入完整代码片段
- 技术术语精准，简述"改了什么"和"为什么改"

## README.md 格式规范

- 结构顺序：简介 → 快速开始 → 核心特性 → 稳定性保障 → 项目结构 → 开发说明
- 特性用 `###` + 2-5 条 `-` 要点，每条不超 2 行
- 禁止暴露内部 API 名、变量名等实现细节
- 新增文件后必须同步更新项目结构部分
