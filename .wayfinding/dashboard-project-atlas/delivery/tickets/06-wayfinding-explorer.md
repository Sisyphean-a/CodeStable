---
交付类型: 功能
状态: 关闭
认领者: "01a00f46-db9f-7b8a-887d-b7fcd0e175b8"
硬依赖: [03-document-reader.md]
来源规格: ../spec.md
---

# 交付探路行动列表与决策依赖图

## 交付结果

用户可在探路页理解当前 frontier、认领、阻塞和已关闭 decision，并按需展开只包含 decision 的有界硬依赖 DAG 和等价文字列表。

## 当前行为

现有 dashboard 仅显示地图汇总计数与进度，不能定位 decision、依赖、阻塞原因、认领者或解析异常。

## 期望行为

探路默认按当前前沿、已认领、被阻塞和已关闭分组列出 decision。每项显示标题、状态、认领者、直接可行动/阻塞原因和硬依赖数；查看依赖进入选中对象的一跳局部 DAG。

## 关键契约

- DAG 只使用 `depends-on`，上游在左、被依赖对象在右；decision 永不与 ticket 混图。
- 节点文字显示标题、状态和 readiness；未解析依赖以诊断节点或未解析边保留，不能渲染为已关闭。
- 初始图最多 20 节点、40 条边；用户手动逐层展开，超限时有截断与完整文字依赖列表。

## 验收标准

- [x] 每个 decision 在行动列表中显示生命周期、认领者、可行动/阻塞原因和依赖数。
- [x] 当前前沿只从已关闭前置、打开且未认领的 decision 派生；缺失/未知前置不会变成可行动。
- [x] DAG 的边方向、图例、状态、解析状态、截断说明和文字等价列表均可访问。
- [x] 节点/列表可进入稳定阅读链接，筛选和展开深度在刷新后尽可能保留。
- [x] Colombia 形状 fixture 验证并行决策依赖和状态事实。

## 范围外

- ticket 图、默认全局图、随机/物理模拟布局和无上限展开。

## 实施结果

- `src/project/graph.js`：有界局部 DAG 投影——只使用 `depends-on` 且只连接同类实体（Decision 与 Ticket 永不混图）；BFS 分层（上游负层/下游正层，确定性 id 排序访问）；未解析依赖保留为未解析边（原始目标文本，不伪造节点）；20 节点/40 边确定性截断并报告剩余数；完整文字等价列表不受图上限影响；同参两次投影结果一致。
- `src/dashboard.js`：`GET /api/graph?entity=&kind=decision|ticket&depth=`；未知实体返回 error。
- `src/web/graph.js`：原生 SVG 确定性分层布局（上游在左、被依赖对象在右，列=层、行=id 排序）；节点显示标题、状态/readiness、认领者，选中态高亮；边带方向箭头；未解析边虚线+文字；图例（方向/状态/readiness/未解析）、截断说明、`role="img"` + aria-label；文字等价列表（节点+边完整清单）。
- `src/web/views/wayfinding.js`：行动列表（当前前沿/已认领/被阻塞/状态未知/已关闭分组，每组带可行动或阻塞原因；每项标题、状态徽标、认领者、依赖数、阅读链接、"查看依赖"入口）；图区（关闭返回、图例、SVG、截断、逐层展开按钮、文字列表）；筛选经 URL `filters` 保留。
- `src/web/app.js`：探路/交付视图在 `entity` 参数存在时异步加载 `/api/graph`，`depth` 承载展开深度，刷新与 Back/Forward 保留。
- 修复：BFS 下游扩展曾误用 `edge.to`（恒为已包含的当前节点）导致下游不可达；未解析边过滤曾误把全部未解析边计入选中图。

## 验证证据

- `npm test`：35 项全部通过，约 1.6 秒（新增 5 项：Colombia 形状 frontier/claimed/blocked/unknown 派生与缺失依赖诊断、DAG 方向/未解析边/文字等价/确定性/深度展开、30 链式节点截断与剩余数、视图分组与图区渲染、HTTP 图 API）。
- 真实 CodeStable 项目：`/api/graph?entity=Decision:...08-technical-architecture.md&depth=2` 返回 10 节点 27 边、分层正确（上游 -2/-1、选中 0、下游 +1/+2）、0 截断、文字列表完整。
- 测试命令：`cd dashboard && npm test`。
