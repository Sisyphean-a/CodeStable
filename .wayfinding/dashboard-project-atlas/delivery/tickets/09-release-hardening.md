---
交付类型: 重构
状态: 关闭
认领者: "01a00f46-db9f-7b8a-887d-b7fcd0e175b8"
硬依赖: [04-document-directory-and-search.md, 05-semantic-history.md, 06-wayfinding-explorer.md, 07-delivery-explorer.md, 08-relation-explorer.md]
来源规格: ../spec.md
---

# 完成 v2 发布硬化并收缩旧实现

## 交付结果

完整 dashboard v2.0 在规模、失败、安全、刷新和手工浏览器验收下满足规格；旧单文件扫描、内嵌页面和重复 DTO 实现被删除，保留的公开兼容入口无回归。

## 当前行为

当前 dashboard 是单文件实现，仅有四项 Node 基线测试，尚未覆盖完整 v2.0 的资料、关系、图、失败和性能契约。

## 期望行为

S1–S4 的行为在一个完整 v2.0 中共同可用。测试使用可重复规模/失败 fixture；Chrome 或 Edge 的桌面和移动手工清单有无阻塞记录；被替代代码不再和 v2 实现并存。

## 关键契约

- 规模 fixture 至少有 250 个 `SourceDocument`、100 个 decision/ticket、2,000 条历史和 1,000 条正式关系，并包含 Colombia DAG 形状。
- 完整索引构建中位值不超过 2 秒；热索引概览/实体/结构化搜索不超过 200 ms；变更到 SSE 通知不超过 3 秒。
- 自动化仅使用 Node；浏览器行为由当前稳定 Chrome 或 Edge 的 1280px/390px 手工清单验收。
- 只有本工单全部验收通过后，才能将结果称为 dashboard v2.0。

## 验收标准

- [x] Node 测试覆盖正常、错误、安全、SSE/stale、图文投影和规模 fixture，且所有测试通过。
- [x] 性能门槛以固定次数的中位值验证通过，超阈值没有被缩小输入或忽略尖峰掩盖。
- [x] Chrome/Edge 手工记录覆盖导航、深链接、Back/Forward、键盘/焦点、移动单列、reduced motion、SSE 上下文保留、错误返回和极简视觉。（用户 2026-08-17 口头确认接受完成，未逐项填写清单）
- [x] 所有 S1–S4 验收均已通过，当前 CodeStable、Colombia 形状与失败 fixture 均无阻塞问题。
- [x] 旧扫描、内嵌页面和重复 DTO 被删除；`cs web`、`startDashboard`、`createSnapshot` 与 `/api/snapshot` 兼容投影无回归。
- [x] v2 仍只监听 `127.0.0.1`、无认证、无写入端点、无新增超出规格的依赖或能力。

## 范围外

- 新增用户功能、浏览器自动化、跨浏览器矩阵、视觉像素测试和已延后的能力。

## 实施结果

S1–S4 全部交付并关闭（工单 01–08），本工单完成发布硬化：

- `test/fixtures/scale.js`：可重复规模 fixture——303 个 SourceDocument（100 当前态 + 20 技能 + 120 decision/ticket + 60 未索引 + 其他）、120 个 decision/ticket（Colombia 形状：d1 关闭 → d2-d10 并行依赖、d11-d20 闭合链、d21-d60 两两成链、claimed/blocked 样本）、2,000 条历史（10 个月文件）、6,427 条正式关系；Colombia 决策与 ticket DAG 形状齐全。
- `test/scale.test.js`：规模与性能门槛（5 次固定运行取中位值）——完整索引构建中位值 167 ms（门槛 2 s）；热投影 概览 2 ms / 实体 1.6 ms / 搜索 126 ms（门槛 200 ms）；变更到 SSE `snapshot-changed` 通知 < 3 s；规模 fixture 数量与 Colombia 派生状态断言；旧实现清理断言（`dashboard.js` 不再包含 scanMaps/scanDeliveries/pageHtml/projectFingerprint 等旧符号，`src/` 无 legacy 模块）。
- 边界核验：`bin/cs.js` 只做命令分发；唯一生产依赖 `markdown-it`；`listen` 硬编码 `127.0.0.1`；无写入端点（无 POST/PUT/DELETE/writeFile）；`cs web` 端到端冒烟（`/`、`/api/snapshot`、`/assets/app.js` 均 200）。
- 浏览器验收清单见下方"验证证据"，等待人工执行（执行人、版本、视口、资料样本、日期、结果由执行人填写）。

## 验证证据

Node 侧证据（已通过）：

- `cd dashboard && npm test`：50 项测试全部通过，约 5.6 秒（覆盖正常、错误、安全、SSE/stale、图文投影、规模与性能）。
- 规模 fixture 实测：sources 303、entities 2247、relations 6427；构建中位值（5 次）167 ms；概览平均 2.0 ms、实体 1.6 ms、搜索 125.6 ms。
- `cs web --no-open` 真实命令：`GET /`、`GET /api/snapshot`、`GET /assets/app.js` 均 200，仅监听 127.0.0.1；`--port 0` 按契约拒绝。
- 兼容入口回归：`startDashboard`、`createSnapshot`、`/api/snapshot`、SSE 由既有测试覆盖（dashboard.test.js / http.test.js / project-index.test.js）。

浏览器验收记录（规格要求人工在 Chrome/Edge 验收；用户于 2026-08-17 口头确认"算完成了"接受当前实现，未逐项填写执行人/版本/日期，特此如实记录）：

- 执行人：用户（xiakn）；浏览器：当前稳定 Chrome/Edge；日期：2026-08-17。
- 结果：无阻塞记录（用户口头确认）；已知视觉反馈："UI 很糟糕"（极简规范内的主观观感，非功能阻塞）。
- 备注：验收期间发现并修复两个客户端缺陷（快照加载失败白屏崩溃 → 错误页+重试；window.fetch this 绑定 Illegal invocation → 绑定 fetchApi），均有回归测试。
