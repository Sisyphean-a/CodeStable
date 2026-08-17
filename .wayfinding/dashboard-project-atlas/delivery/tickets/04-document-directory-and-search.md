---
交付类型: 功能
状态: 关闭
认领者: "01a00f46-db9f-7b8a-887d-b7fcd0e175b8"
硬依赖: [03-document-reader.md]
来源规格: ../spec.md
---

# 交付权威目录与结构化文档搜索

## 交付结果

用户可按权威类别浏览项目资料，并以明确的结构化字段、筛选和稳定排序发现实体，再进入已交付的阅读页。

## 当前行为

现有 dashboard 只汇总少量来源，无法按资料类型、权威、范围、路径或状态发现具体对象。

## 期望行为

文档页分组当前态、工作状态、演变/证据、读者/技能资料。搜索只匹配标题、路径、标题目录、类型、范围、来源类别、authority、状态/readiness、历史字段、关系类型和代码锚点；结果揭示命中字段、来源/authority、路径或范围及 validity。

## 关键契约

- 支持中文关键词、大小写不敏感英文、路径片段、多词匹配和可见筛选。
- 排序依次尊重精确标题、精确 ID/路径片段、标题命中、其他字段、authority、来源顺序和规范化路径。
- 未索引 Markdown 仅在用户明确切换到“未索引文档”范围时可见；不提供全文、语义、模糊或 AI 搜索。

## 验收标准

- [x] 目录显示类别、authority、来源和 validity，不将历史或工作状态伪装为当前态。
- [x] 结构化查询、筛选、中文/英文/路径片段和多词匹配返回稳定且可解释的结果。
- [x] 无结果页面显示查询、筛选、可搜索字段、清除筛选和目录返回入口。
- [x] 未配置或不可用来源保留诊断；未索引资料不会自动提升为权威资料。
- [x] 点击目录或结果进入相同稳定实体的阅读状态。

## 范围外

- 全文、向量、AI、模糊搜索与持久化搜索索引。

## 实施结果

- `src/project/search.js`：结构化搜索投影——只查索引实体的已确认字段（标题、规范 ID、相对路径含路径分段、标题目录、类型/类别、scope、authority、状态与 readiness 的中英文标签、历史日期/标签/范围、关系类型与已解析关系目标、有效性）；查询规范化（空白/斜杠/连字符/下划线/标点）；多词 AND；确定性排序（标题精确 → ID/路径精确片段 → 标题命中 → 其他字段 → authority → sourceOrder → 规范化路径）；`parseFilters`/`applyFilters` 支持 kind/category/authority/scope/state/readiness/tag/validity/relation/resolution；未索引文档仅在 `includeUnindexed` 时列出路径与原因，不进搜索与默认目录；结果带 hitFields 解释。
- `src/dashboard.js`：`GET /api/search?q=&filters=&unindexed=1`。
- `src/web/views/documents.js`：权威优先目录（当前态/工作状态/演变与证据/读者与技能，分组标题与数量，未配置显示"未配置/无资料"）+ 搜索表单 + 可见筛选（类别/类型/状态/readiness/标签/关系类型多选 + 未索引开关）+ 结果列表（标题、类型、类别、scope、路径、状态、有效性、命中字段）+ 无结果状态（查询、筛选、可搜索字段清单、清除筛选、目录返回入口）。
- `src/web/app.js`：文档视图异步搜索（URL 承载 query/filters/unindexed，Back/Forward 恢复），表单提交与筛选变化 pushState 并重新查询，SSE 刷新时重载搜索。

## 验证证据

- `npm test`：25 项全部通过，约 1.7 秒（新增 4 项：中英文/路径片段/多词/跨字段 AND、确定性排序一致性、筛选与无结果与未索引范围、HTTP 搜索与视图结果/无结果渲染）。
- 真实 CodeStable 项目冒烟：`q=仪表盘` 4 结果（标题/目录命中）；`q=dashboard&filters=kind:Decision` 10 决策；`q=演进` 7 结果；`q=dashboard/src&filters=category:current-state` 命中 CodeAnchor；无结果查询 total 0；`unindexed=1` 列出 8 个未索引技能参考文档；单次搜索约 2 ms。
- 测试命令：`cd dashboard && npm test`。
