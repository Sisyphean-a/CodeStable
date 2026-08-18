---
交付类型: 缺陷
状态: 关闭
认领者: ""
硬依赖: []
来源规格: ../spec.md
---

# 恢复概览导读与当前注意力

## 交付结果

概览重新作为项目导读而非统计摘要：项目身份、权威阅读路径、当前项目地图、语义演变和当前注意力均展示已确认的可理解、可定位信息。

## 当前行为

`dashboard/src/web/views/overview.js` 只显示项目名称、Git 与技能计数；阅读路径没有优先阅读理由；“当前项目地图”只投影探路地图统计；语义演变只显示月份计数；当前注意力只显示聚合数量。

## 期望行为

概览满足 AC-01 至 AC-07，且继续仅消费 `ProjectIndex` 派生投影，不单独扫描项目文件。

## 关键契约

- [纠偏规格 AC-01 至 AC-07](../spec.md)
- [首次打开的信息架构](../../decisions/03-first-open-information-architecture.md)
- [实体与关系模型](../../decisions/02-entity-relation-model.md)
- [时间线、依赖图与关系图](../../decisions/05-temporal-and-graph-views.md)

## 验收标准

- [x] AC-01
- [x] AC-02
- [x] AC-03
- [x] AC-04
- [x] AC-05
- [x] AC-06
- [x] AC-07

## 范围外

- 不改变导航页面集合、关系模型、资料权威顺序或图的语义。
- 不在概览加入完整对象列表、全文、默认全局关系图或新的项目文件扫描路径。

## 实施结果

已恢复概览导读投影与展示：`ProjectIndex` 继续作为唯一数据来源，概览现在显示项目简述、仓库根、包/范围、逐项阅读理由、当前态地图、近期语义历史和可定位的当前注意力对象。Git 索引同时保留工作区变更路径，供概览展示文件、状态和原因。本次审查确认 AC-01～AC-07 已闭合，按交付技能在关闭前清空认领者。

## 验证证据
| AC | 证据 | 当前观察 |
| --- | --- | --- |
| AC-01 | `dashboard/test/views.test.js` 概览 fixture 断言 `identity.summary`，并断言 HTML 显示项目简述；`cd dashboard && node --test test/views.test.js` | 通过 |
| AC-02 | 同一 fixture 断言 `identity.root` 为 `.` 且快照不含 Windows 绝对路径；真实仓库快照同样核验无绝对路径 | 通过 |
| AC-03 | 同一 fixture 断言 `identity.packages` 与 `identity.scopes`，概览显示包和范围 | 通过 |
| AC-04 | 同一 fixture 断言每个 `readingPath` 项有 `reason`，概览显示“先读理由” | 通过 |
| AC-05 | 无 `.wayfinding/`、有当前态入口的 fixture 断言 `currentMap` 条目、范围、公开边界和代码锚点，并确认不显示探路地图未配置 | 通过 |
| AC-06 | 含有效历史条目的 fixture 断言日期、标签、结果、范围、原因和解析后的当前依据目标；概览显示六个字段 | 通过 |
| AC-07 | fixture 断言 frontier、claimed、Ready、blocked、诊断和工作区变更对象的状态/原因；`git` fixture 断言变更路径 | 通过 |

验证命令：

- `cd dashboard && node --test test/views.test.js`：6/6 通过。
- `cd dashboard && npm test`：52/52 通过。
- 真实仓库 `createSnapshot` 冒烟：概览投影可生成，`currentMap` 已配置，阅读路径每项有理由，工作区变更以仓库相对路径呈现，未发现 Windows 绝对路径泄漏。
- 当前模型直接审查：标准轴无阻塞发现；需求轴 AC-01～AC-07 全部通过；真实快照字段完整性、路径安全和只消费 `ProjectIndex` 投影的复核均通过。

## 独立审查

- 审查者：当前会话 `01a0136e-ca53-760f-89fe-5bd942fb49db`；日期：2026-08-18。
- 审查方式：用户明确要求由当前 `hi/gpt-5.6-luna` 模型直接审查；这是重新读取契约和实际差异后的非隔离审查，不伪称为独立 agent 上下文。
- 标准轴：无阻塞发现。实际差异未引入独立文件扫描、写入端点、绝对路径 ID、未转义 HTML 或兼容入口变更；性能回归与全量回归均通过。
- 需求轴：
  - AC-01：通过，项目摘要投影并在概览显示。
  - AC-02：通过，仓库根为 `.`，快照和真实概览无 Windows 绝对路径。
  - AC-03：通过，包与范围投影并在身份/地图区域显示。
  - AC-04：通过，每个阅读路径项均有可见先读理由。
  - AC-05：通过，当前态入口投影范围、包、领域上下文、公开边界和代码锚点；无探路地图时仍有当前态地图。
  - AC-06：通过，近期有效历史显示日期、标签、结果、范围、原因和可解析当前依据入口。
  - AC-07：通过，frontier、claimed/Ready/blocked ticket、诊断和工作区变更均有对象、状态和原因。
- 总门禁：通过，可关闭。
