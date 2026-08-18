# Dashboard v2 纠偏验收规格

## 目的地

只修正当前 Dashboard v2 对已确认项目导读、移动导航、刷新失败呈现和性能契约的违例。产品范围、资料模型、关系语义、图形语义与原始交付决定继续由本地图的关闭决定拥有；本规格不重新裁决它们。

## 验收标准

- [ ] AC-01：概览的“项目身份”显示项目简述，而不只显示项目名称、Git 状态和技能数量。（来源：[03：首次打开的信息架构](../decisions/03-first-open-information-architecture.md)）
- [ ] AC-02：概览的“项目身份”显示仓库根上下文，且不暴露 Windows 绝对路径。（来源：[03：首次打开的信息架构](../decisions/03-first-open-information-architecture.md)、[04：阅读与上下文交互](../decisions/04-reading-and-context-interaction.md)）
- [ ] AC-03：概览的“项目身份”显示包与范围概要。（来源：[03：首次打开的信息架构](../decisions/03-first-open-information-architecture.md)）
- [ ] AC-04：权威阅读路径中的每个入口显示一句说明其优先阅读原因的可见文本，而不只显示标题、类型、路径或有效性。（来源：[03：首次打开的信息架构](../decisions/03-first-open-information-architecture.md)）
- [ ] AC-05：当前项目地图从当前态入口投影范围、包、领域上下文、公开边界和代码锚点；未配置探路地图时，该区域仍可阅读，不能退化为“探路地图未配置”。（来源：[03：首次打开的信息架构](../decisions/03-first-open-information-architecture.md)、[02：实体与关系模型](../decisions/02-entity-relation-model.md)）
- [ ] AC-06：概览的语义演变展示近期有效语义历史的日期、标签、结果、范围、原因摘要和当前依据入口，而不只展示月文件计数。（来源：[03：首次打开的信息架构](../decisions/03-first-open-information-architecture.md)、[05：时间线、依赖图与关系图](../decisions/05-temporal-and-graph-views.md)）
- [ ] AC-07：当前注意力为每个现存的活跃探路、已认领/Ready/被阻塞 ticket、未解决诊断和工作区变更显示可定位对象、状态和直接原因，而不只显示汇总计数或百分比。（来源：[03：首次打开的信息架构](../decisions/03-first-open-information-architecture.md)）
- [ ] AC-08：在 390px 视口，全局导航通过可访问的抽屉开关进入；键盘可打开和关闭，打开时焦点进入抽屉，关闭时返回触发控件。（来源：[03：首次打开的信息架构](../decisions/03-first-open-information-architecture.md)、[04：阅读与上下文交互](../decisions/04-reading-and-context-interaction.md)、[09：质量与验证契约](../decisions/09-quality-contracts.md)）
- [ ] AC-09：轮询资料指纹时发生读取、权限或路径错误，保留最后成功索引并把快照标记为 `stale`，提供可定位错误诊断并发送 `snapshot-stale`；不得仅输出终端日志后继续显示 fresh 快照。（来源：[01：资料与显式关系契约](../decisions/01-artifact-contracts.md)、[08：技术边界](../decisions/08-technical-architecture.md)）
- [ ] AC-10：有效的受跟踪资料变更后，`GET /api/snapshot` 返回重建后的投影并发送 `snapshot-changed`，端到端耗时不超过 3 秒。（来源：[08：技术边界](../decisions/08-technical-architecture.md)、[09：质量与验证契约](../decisions/09-quality-contracts.md)）
- [ ] AC-11：在既定规模 fixture 上，热索引的结构化搜索中位耗时不超过 200ms。（来源：[09：质量与验证契约](../decisions/09-quality-contracts.md)）

## 横切契约

- 纠偏后的概览、阅读路径、项目地图、语义演变和当前注意力仍只消费 `ProjectIndex` 投影；不为页面单独扫描或重新解释项目文件。（来源：[02：实体与关系模型](../decisions/02-entity-relation-model.md)、[08：技术边界](../decisions/08-technical-architecture.md)）
- 保持 `cs web`、Node.js 20+、`127.0.0.1`、本地只读、无写入端点、`startDashboard`、`createSnapshot` 和 `/api/snapshot` 兼容投影。（来源：[08：技术边界](../decisions/08-technical-architecture.md)、[10：版本范围与验收切片](../decisions/10-release-scope.md)）
- 每个 AC 都需要直接、可重跑的证据；整套测试通过只作为回归证据。路由、阅读、图、样式或刷新变更后，浏览器发布清单仍为强制门禁。（来源：[09：质量与验证契约](../decisions/09-quality-contracts.md)）

## 原型约束

- 绑定：短标签的项目导读与阅读路径；独立阅读页和按需信息检查器；基于真实 decision/ticket 硬依赖及状态的图形化路线/工作线；图的文字替代。不得退回为线性伪流程、无依据关系图或纯文本主视图。（来源：[07：界面原型判断](../decisions/07-interface-prototype.md)）
- 非绑定：图形的具体视觉感觉可以迭代；本轮不晋升视觉基线资产。（来源：[07：界面原型判断](../decisions/07-interface-prototype.md)）

## 聚焦证据要求

| AC | 直接证据要求 | 当前观察 |
| --- | --- | --- |
| AC-01 | 在 `dashboard/test/views.test.js` 增加概览投影 fixture 断言项目简述；执行 `cd dashboard && node --test test/views.test.js`。 | `overview.js` 只渲染名称、Git 与技能数量。 |
| AC-02 | 同一概览 fixture 断言仓库根上下文存在且无绝对路径；执行上述命令。 | `overview.js` 未渲染仓库根。 |
| AC-03 | 同一概览 fixture 断言包与范围概要；执行上述命令。 | `overview.js` 未渲染包或范围。 |
| AC-04 | 同一概览 fixture 为每个阅读路径项断言可见阅读理由；执行上述命令。 | `overview.js` 只渲染标题、类型、路径和有效性。 |
| AC-05 | 使用无 `.wayfinding/` 但有当前态入口的 fixture，断言项目地图内容与来源；执行 `cd dashboard && node --test test/views.test.js`。 | 当前区域只消费 `overview.maps`，无探路地图时显示未配置。 |
| AC-06 | 使用含有效历史条目的 fixture，断言概览显示所需六个历史字段及当前依据链接；执行 `cd dashboard && node --test test/views.test.js`。 | 当前区域只显示月份、有效数和格式错误数。 |
| AC-07 | 使用同时包含 frontier、claimed/ready/blocked、诊断和工作区变更的 fixture，断言各项对象、状态和原因；执行 `cd dashboard && node --test test/views.test.js`。 | 当前区域只显示计数。 |
| AC-08 | Chrome 或 Edge 当前稳定版，390px，记录执行人、日期、浏览器版本、资料样本和 Tab/Enter/Escape 的焦点观察；同时保留对应 DOM/状态单测。 | `index.html` 无抽屉控件，移动 CSS 仅换行。 |
| AC-09 | 注入或 fixture 化资料指纹读取失败，断言 `/api/snapshot` 为 `stale`、诊断可定位且 SSE 收到 `snapshot-stale`；执行 `cd dashboard && node --test test/dashboard.test.js test/scale.test.js`。 | `refresh-store.js` 仅写 `console.error` 并保持原状态。 |
| AC-10 | 对有效 Markdown 变更轮询 `/api/snapshot` 与 `/events`，断言重建投影及 `snapshot-changed` 均在 3 秒内；执行 `cd dashboard && node --test test/dashboard.test.js test/scale.test.js`。 | 当前 `dashboard.test.js` 的受跟踪变更用例在 900ms 等待后失败；本轮 `npm test` 为 49/51 通过。 |
| AC-11 | 以现有规模 fixture 记录热搜索固定次数中位值，断言不超过 200ms；执行 `cd dashboard && node --test test/scale.test.js --test-name-pattern="hot index projections"`。 | 本轮 `npm test` 报告 `search 230ms`。 |

## Waivers

无。

## 范围外

- 不改变原始 v2 产品决定、资料模型、正式关系集合、图的语义与绑定原型属性；这些仍由关闭的 decision 文件拥有。
- 不引入远程访问、认证、写入操作、全文/AI/模糊搜索、默认全局图、持久化或复杂增量索引、浏览器自动化或视觉像素测试。

## 来源

- [Dashboard 项目全景工作台地图](../map.md)
- [03：首次打开的信息架构](../decisions/03-first-open-information-architecture.md)
- [07：界面原型判断](../decisions/07-interface-prototype.md)
- [08：技术边界](../decisions/08-technical-architecture.md)
- [09：质量与验证契约](../decisions/09-quality-contracts.md)
- [当前概览实现](../../../dashboard/src/web/views/overview.js)
- [当前移动导航壳](../../../dashboard/src/web/index.html)
- [当前刷新存储](../../../dashboard/src/server/refresh-store.js)
- [当前刷新与规模测试](../../../dashboard/test/dashboard.test.js)
- [当前性能门槛测试](../../../dashboard/test/scale.test.js)
