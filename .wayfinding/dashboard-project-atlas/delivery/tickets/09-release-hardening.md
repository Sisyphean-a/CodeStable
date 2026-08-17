---
交付类型: 重构
状态: 打开
认领者: ""
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

- [ ] Node 测试覆盖正常、错误、安全、SSE/stale、图文投影和规模 fixture，且所有测试通过。
- [ ] 性能门槛以固定次数的中位值验证通过，超阈值没有被缩小输入或忽略尖峰掩盖。
- [ ] Chrome/Edge 手工记录覆盖导航、深链接、Back/Forward、键盘/焦点、移动单列、reduced motion、SSE 上下文保留、错误返回和极简视觉。
- [ ] 所有 S1–S4 验收均已通过，当前 CodeStable、Colombia 形状与失败 fixture 均无阻塞问题。
- [ ] 旧扫描、内嵌页面和重复 DTO 被删除；`cs web`、`startDashboard`、`createSnapshot` 与 `/api/snapshot` 兼容投影无回归。
- [ ] v2 仍只监听 `127.0.0.1`、无认证、无写入端点、无新增超出规格的依赖或能力。

## 范围外

- 新增用户功能、浏览器自动化、跨浏览器矩阵、视觉像素测试和已延后的能力。

## 实施结果
<!-- 关闭时填写结果摘要 -->

## 验证证据
<!-- 关闭时填写可复现命令或其他证据 -->
