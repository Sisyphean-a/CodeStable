---
name: cs-onboard
description: "项目记忆脚手架。在仓库初始化 CodeStable，或把现有 `.codestable` 迁到当前态、需求与 history 模型时使用。"
argument-hint: "[初始化|迁移] [范围]"
---

# 项目记忆脚手架

建立一个可按 scope 加载的小型项目记忆。

## 目标结构

```text
.codestable/
├── attention.md
├── architecture/
│   ├── INDEX.md
│   ├── shared/
│   └── packages/
├── requirements/
│   ├── CONTEXT.md
│   └── adrs/
└── history/
```

monorepo 只使用一个根目录，并以 `scope: workspace` 或 `scope: package:<name>` 标记事实。

## 步骤

1. **检查。** 找出仓库根、workspace/package、公开边界、现有项目规则和 `.codestable` 内容。**完成条件：拓扑及 scaffold/migrate 模式明确。**
2. **搭建。** 创建目标目录，写简短 attention、带代码锚点和包归属的架构索引，以及只含已验证术语/稳定规则/不变量的 CONTEXT；有证据时才建 package/shared 页面。**完成条件：新会话无需扫描仓库即可定位 scope。**
3. **迁移分支。** 只有存在旧任务、审查、探索或 runtime 资料时，才读[旧记忆迁移](references/migration.md)，按主题处理。**完成条件：每个已迁移事实有当前 owner，未迁移来源仍原样保留。**
4. **检索验证。** 用一个 workspace 任务和每个已表示 package 按 scope 加载。只有该分支需要读取[项目记忆模型](../cs-domain/references/memory-model.md)的“按 scope 加载”小节。**完成条件：不遍历任务目录或无关包即可找到当前设计、原因和替代历史。**
5. **剪枝。** 唯一证据已表示或可从 Git 恢复后，删除旧 runtime、gate、模板和过程目录。**完成条件：不存在新旧双轨。**

## 完成条件

目标树是唯一默认入口，当前态与代码一致，shared 事实只有一个 owner，旧证据可追溯，项目内未安装流程 runtime。
