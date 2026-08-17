---
交付类型: 功能
状态: 关闭
认领者: "01a00f46-db9f-7b8a-887d-b7fcd0e175b8"
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

- [x] delivery 有规格时可阅读规格和 ticket；不存在时显示未配置而不是零进度。
- [x] 每张 ticket 显示状态、认领者、来源规格、可行动/阻塞原因和依赖数。
- [x] Ready/Claimed/Blocked 从真实前置状态派生；缺失或未知依赖不被显示为 ready。
- [x] DAG 图文一致、方向/状态/解析状态/截断可见，并可进入稳定阅读链接。
- [x] Colombia 形状 fixture 验证 11 ticket 的并行分支、claimed、ready 和 blocked 路径。

## 范围外

- decision 图、面板内认领/关闭 ticket、通用项目管理工作流。

## 实施结果

- `src/web/views/delivery.js`：ticket 行动列表（Ready/已认领/被阻塞/状态未知/已关闭分组，每组带可行动或阻塞原因；每项标题、状态徽标、认领者、依赖数、交付类型、阅读链接、"查看依赖"入口；规格链接到阅读态；无规格显示"规格：未配置"；无交付面显示"交付面：未配置/无资料"）+ ticket DAG 图区（关闭返回、图例、SVG、截断说明、逐层展开、文字列表）。
- `src/web/app.js`：交付视图 `entity` 参数触发 `/api/graph?kind=ticket` 异步加载，`depth` 保留展开深度（基础设施复用工单 06）。
- `src/project/graph.js`：kind=ticket 分支（06 已支持，07 验证 ticket 图只含 ticket 节点）。

## 验证证据

- `npm test`：39 项全部通过（新增 4 项：11-ticket Colombia 形状 readiness 派生（4 ready/2 claimed/2 blocked/1 unknown/2 closed）与缺失依赖诊断、ticket DAG 并行分支与 decision 永不混图、视图分组/规格链接/图区渲染、HTTP ticket 图与未配置交付面）。
- 真实 CodeStable 项目：`/api/graph?entity=Ticket:...03-document-reader.md&kind=ticket&depth=1` 返回 8 节点 7 边——上游 01/02（关闭 none）、下游 04-08（04-06 关闭、07 claimed、08 ready），与当前真实工单状态一致。
- 测试命令：`cd dashboard && npm test`。
