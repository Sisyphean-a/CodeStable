---
scope: package:dashboard
code-paths:
  - dashboard
---

# 仪表盘包

本包提供本地只读 Web 文档阅读器（兼容旧入口）。`npm link` 将 `dashboard/bin/cs.js` 注册为本机 `cs` 命令；在任意 CodeStable 项目目录执行 `cs web` 后，它向上查找最近的 `.codestable`，在 `127.0.0.1` 启动服务并打开浏览器。

## 公开边界

- `cs web [--port <port>] [--no-open]`：启动一次本地仪表盘；没有 `.codestable` 时以错误退出。
- 服务只监听 `127.0.0.1`，不提供远程访问、认证或写入端点。
- 页面读取 `.codestable/`、可选的 `.wayfinding/` 和 `.delivery/`、Git 状态及仓库内 `skills/`；轮询这些输入并通过 Server-Sent Events 局部刷新浏览器。
- 兼容入口：`startDashboard`、`createSnapshot` 与 `GET /api/snapshot` 保留；快照与所有页面投影只由 `ProjectIndex` 派生。

## 职责与边界

- `bin/cs.js` 只分发命令并报告用户输入错误。
- 每次扫描构建一个有类型的只读 `ProjectIndex`（`schemaVersion`、`project`、`sources`、`entities`、`relations`、`diagnostics`、`generatedAt`）；资料源只解析一次，页面与 API 只能消费索引投影，不能各自重新解释项目文件。
- 实体使用稳定 ID（`<kind>:<仓库相对路径>`、`HistoryEntry:<月文件>:<日期>:<序号>`、`GitCommit:<完整hash>`、`CodeAnchor:<符号>`），不泄露 Windows 绝对路径；decision/ticket readiness（frontier/ready、claimed、blocked、none、unknown）从状态、认领者与硬依赖派生，不写回项目文件。
- 正式关系只来自目录契约、规范字段、Markdown 链接、当前依据、来源、evidence、代码锚点和可验证 Git 事实，保留 `kind`、provenance 与 `resolved | unresolved | external | unsafe` 解析状态；反向引用由同一关系派生。
- 诊断（`error | warning | info`）覆盖缺失、未知枚举、重复 ID、坏链接、缺失依赖、越界路径、历史格式错误、读取失败与 Git 不可用；缺失、冲突、未知和失败不得静默降级为成功或空集合。
- 刷新以完整新索引的原子替换为准；重建失败保留最后成功快照并公开 `stale` 状态（SSE 事件 `snapshot-changed` / `snapshot-stale`），页面局部重取数据并保持 URL、选择、筛选、图展开深度与滚动位置。
- 仪表盘只展示派生结果，不认领或关闭决策项、工单，也不写入 `.codestable`、规划面或 Git。

## 产品主线

`package:dashboard` 是 CodeStable 技能包之外的可选只读辅助包，定位是面向项目资料的文档阅读器，而不是项目状态控制台或任务工作台。它服务于已经对 CodeStable 项目有明确关注点的开发者：提供所有可读资料的直接入口，让开发者按自己的意愿阅读、查找并沿着明确关系继续深入。

- 核心对象是文档，核心动作是打开、阅读、查找和继续追踪。
- 首页应直接提供所有可读文档的入口，不要求用户先接受项目概览或系统推测。
- 节点图、分类和搜索都是文档索引方式；节点与关系必须来自可验证的项目资料，不生成兴趣推荐或似是而非的解释。
- 阅读深度由开发者决定；面板不强迫完整盘点项目，也不强迫理解实现细节。
- 面板不主动评价项目价值，不做无请求治理，不执行技能任务，不认领或关闭工作项。
- `archify` 可借鉴其统一的空间表达、节点聚焦和关系可读性，但不引入流程编排、演示叙事或自动推断作为面板目标。

## 模块结构

- `src/project/`：`root.js`（项目根发现）、`sources.js`（资料枚举与 SourceDocument，含 raw 原文与按元数据缓存复用）、`markdown.js`（frontmatter/标题锚点/显式链接）、`index.js`（ProjectIndex 构建、实体、历史解析、Git 扫描）、`relations.js`（正式关系与目标解析）、`diagnostics.js`、`projections.js`（兼容快照、文档目录与文档地图投影）、`entity-detail.js`（实体详情/原文投影与 ID 安全校验）、`search.js`（结构化搜索）、`history.js`（语义历史时间线）、`graph.js`（decision/ticket 依赖 DAG）、`relation-graph.js`（局部关系图）。
- `src/server/`：`refresh-store.js`（指纹轮询、完整重建、原子替换、stale）、`static.js`（同源静态资源与安全头）、`markdown-render.js`（受限 markdown-it 渲染：html 关闭、linkify/图片禁用、链接按解析状态应用安全规则）。
- `src/web/`：`index.html` + `app.js`（History API 路由、SSE 协调、视图分发）+ `views/*.js`（文档入口、地图、阅读与兼容视图纯函数）+ `graph.js`（原生 SVG 有界图布局）+ `styles.css`（编辑式极简）。
- API：`/api/snapshot`、`/api/entities/:id`、`/api/entities/:id/raw`、`/api/search`、`/api/history`、`/api/graph`、`/api/relations`、`/events`；客户端只按稳定实体 ID 请求，静态资源与 API 拒绝路径穿越，响应带明确 MIME、`nosniff` 与同源 CSP。

## 依赖与质量

- 唯一生产依赖：`markdown-it`（受限配置）。客户端无框架、无构建链、无图形/状态库；原生 ESM + History API + 原生 SVG。
- 自动化测试只用 Node 20 内置 `node:test`：`npm test` 覆盖正常、错误、安全、SSE/stale、图文投影、Colombia 形状与规模 fixture（≥250 SourceDocument、100 decision/ticket、2000 历史条目、1000 正式关系）；性能门槛为完整索引构建中位值 ≤2 秒、热索引投影 ≤200 ms、变更到 SSE ≤3 秒。
- 浏览器可用性（键盘/焦点、移动单列、reduced motion、深链接、Back/Forward、极简视觉）由 Chrome/Edge 人工发布清单验收。

## 代码锚点

- `dashboard/package.json`
- `dashboard/bin/cs.js`
- `dashboard/src/dashboard.js`
- `dashboard/src/project/index.js`
- `dashboard/src/project/projections.js`
- `dashboard/src/server/refresh-store.js`
- `dashboard/src/web/app.js`
- `dashboard/test/dashboard.test.js`
- `dashboard/test/scale.test.js`
