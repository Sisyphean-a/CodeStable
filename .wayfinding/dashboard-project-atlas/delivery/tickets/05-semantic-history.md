---
交付类型: 功能
状态: 关闭
认领者: "01a00f46-db9f-7b8a-887d-b7fcd0e175b8"
硬依赖: [03-document-reader.md]
来源规格: ../spec.md
---

# 交付语义历史时间线

## 交付结果

用户可按 CodeStable 语义历史的真实排序阅读变化、筛选范围和依据，并将 Git 仅作为可验证 evidence 进入详情。

## 当前行为

现有 dashboard 只显示月文件标题和条目计数，格式错误的日期前缀行可能被误计入历史。

## 期望行为

历史页显示有效条目的日期、类型、结果、范围、原因、当前依据和 evidence，按月文件日期逆序与同日写入顺序排列；支持日期、范围、标签、当前依据和规范主题筛选。

## 关键契约

- 只有完整可解析的语义历史条目才计入时间线；错误行保留原文和定位诊断。
- Git commit、代码路径和原始来源是 evidence，不是第二条提交时间线或变更树。
- 只有有明确关系依据时才显示局部演变链；不猜测因果。

## 验收标准

- [x] 时间线按既定语义历史排序，并展示类型、结果、范围、原因、当前依据和 evidence。
- [x] 日期、范围、标签、当前依据和主题筛选不改变来源事实或稳定排序。
- [x] 解析失败历史行不计数，可在阅读/诊断中定位。
- [x] Git 证据以带类型的链接呈现，不能替代语义历史。
- [x] 有依据的演变链标注边类型；无依据时保持时间线。

## 范围外

- Git 提交图、完整 Git 客户端和推断因果关系。

## 实施结果

- `src/project/history.js`：历史时间线投影——按语义历史真实排序（月文件日期逆序、同日写入顺序，月份分组）；条目携带 date/tag/result/range/reason/currentBasis/evidence/startLine 与演变链（current-basis/evidence/supersedes/links-to 边，含解析状态与目标）；筛选（date 前缀/range 包含/tag/basis 文本）与规范主题（结果/原因/证据多词 AND）只改变投影不改变来源事实；格式错误行不计数并保留行号诊断。
- `src/dashboard.js`：`GET /api/history?filters=&theme=`。
- `src/web/views/history.js`：语义时间线视图——每条显示日期、标签徽标、结果、范围、原因、当前依据（已解析目标进入阅读、未解析保留原文与状态）、证据（commit → GitCommit 阅读链接带"提交"类型、代码路径 → 实体阅读、外部会话 → 不可导航文本）、演变链区块（边类型 + 解析状态）；主题输入 + 日期/标签/范围/当前依据字段筛选；无结果状态带清除与返回；格式错误行计数提示。
- `src/web/app.js`：历史视图异步加载，URL 承载 `theme`/`historyFilters`，Back/Forward 恢复。
- 顺带修复（根因）：真实项目历史文件为 CRLF，且 Node 24 的 `$` 不再匹配行尾 `\n` 前位置，历史条目首行与字段正则的行尾 `$` 导致全部条目解析失败；改为无行尾锚点的正则（`\s*$` 类模式经 `\s` 吞换行不受影响）。

## 验证证据

- `npm test`：30 项全部通过，约 1.5 秒（新增 5 项：月逆序/同日顺序、筛选与主题不改变事实与顺序、坏行不计数且可定位、演变链边类型与 Git 证据类型（无 .git 时 unresolved + git-unavailable 诊断）、HTTP 时间线与筛选）。
- 真实 CodeStable 项目：`/api/history` 12 条有效（2026-08 八条 + 2026-07 四条，0 格式错误），首条 2026-08-17 功能条目带 current-basis → ArchitectureDocument/ArchitectureIndex/RequirementIndex 演变链；`filters=tag:演进` 10 条；`theme=仪表盘` 1 条。
- 测试命令：`cd dashboard && npm test`。
