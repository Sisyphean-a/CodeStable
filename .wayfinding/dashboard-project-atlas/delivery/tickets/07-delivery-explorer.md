---
交付类型: 功能
状态: 打开
认领者: ""
硬依赖: [03-document-reader.md]
来源规格: ../spec.md
---

# 交付实施状态与 ticket 依赖图

## 交付结果

用户可在交付页理解规格、Ready、已认领、被阻塞和已关闭 ticket，并按需展开只包含 ticket 的有界硬依赖 DAG 和等价文字列表。

## 当前行为

现有 dashboard 仅显示 delivery 是否存在和汇总计数，无法查看规格、ticket 验收、来源规格、阻塞路径或真实工作线。

## 期望行为

交付默认按 Ready、已认领、被阻塞和已关闭分组列出 ticket。每项显示标题、状态、认领者、直接可行动/阻塞原因、硬依赖数和来源规格；未配置 delivery 明确显示未配置。

## 关键契约

- ticket readiness 从状态、认领者和硬依赖派生；不写回项目文件。
- ticket DAG 只使用 `depends-on`，永不与 decision 混图。
- 节点、边、图例、截断、文字替代和逐层展开遵守 20 节点/40 边限制。

## 验收标准

- [ ] delivery 有规格时可阅读规格和 ticket；不存在时显示未配置而不是零进度。
- [ ] 每张 ticket 显示状态、认领者、来源规格、可行动/阻塞原因和依赖数。
- [ ] Ready/Claimed/Blocked 从真实前置状态派生；缺失或未知依赖不被显示为 ready。
- [ ] DAG 图文一致、方向/状态/解析状态/截断可见，并可进入稳定阅读链接。
- [ ] Colombia 形状 fixture 验证 11 ticket 的并行分支、claimed、ready 和 blocked 路径。

## 范围外

- decision 图、面板内认领/关闭 ticket、通用项目管理工作流。

## 实施结果
<!-- 关闭时填写结果摘要 -->

## 验证证据
<!-- 关闭时填写可复现命令或其他证据 -->
