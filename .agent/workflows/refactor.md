---
description: 在开发新功能前清理遗留代码（必须使用中文交互）。
---

## 用户输入

$ARGUMENTS

## 执行指令

1. **审计 (Audit)**: 扫描目标目录 `$ARGUMENTS`。
2. **章程核查 (Constitution Check)**: 对照 `/memory/constitution.md` 进行检查，所有的反馈和总结**必须使用简体中文**。
3. **重构 (Refactor)**: 在**不改变业务逻辑**的前提下，运用更现代的模式（例如：“将 Promises 转换为 Async/Await”）。
4. **验证 (Verify)**: 运行现有的测试流程，以确保没有退化问题产生。