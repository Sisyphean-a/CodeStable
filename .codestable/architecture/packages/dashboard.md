---
scope: package:dashboard
code-paths:
  - dashboard
---

# 仪表盘包

本包提供本地只读 Web 仪表盘（文档导航工作台）。`npm link` 将 `dashboard/bin/cs.js` 注册为本机 `cs` 命令；在任意 CodeStable 项目目录执行 `cs web` 后，它向上查找最近的 `.codestable`，在 `127.0.0.1` 启动服务并打开浏览器。

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

## 文档工作台界面契约

- `cs web` 的用户界面是项目文档的导航与阅读入口，不是代码浏览器、运行时 dashboard 启动器或指标面板。
- 首页以 `.codestable/architecture/INDEX.md` 为主要项目语境，只展示项目范围、包与能力、当前态文档、变化、历史和全部文档等入口；不展示近期变化明细、统计指标或整篇文档正文。
- 左侧导航采用语义分组并保留真实路径/包名；子入口直接打开对应文档或历史阅读页，不增加中间列表层。
- 包入口使用“包文档页”语义：点击 `package:dashboard` 直接阅读 `.codestable/architecture/packages/dashboard.md`，不打开 dashboard 运行时页面，不生成代码入口或代码路径列表。
- 文档阅读页固定左侧导航，主区显示原文；顶部只保留返回、当前路径和文档标题，不增加第二套文档目录。原始文档中的代码锚点按原文保留，但不被提升为导航能力。
- `README.md` 是普通读者文档，不是首页主要项目说明；架构索引缺失时显示明确的未配置状态并保留真实文档入口，读取失败时公开诊断，不静默回退到 README。
- 首页采用安静的文档工作台视觉：浅色中性背景、清晰层级、适度留白和低装饰；项目内容区域只显示索引/文档真实内容，UI 不添加宣传式标题或解释性副文案。

## 模块结构

- `src/project/`：`root.js`（项目根发现）、`sources.js`（资料枚举与 SourceDocument，含 raw 原文与按元数据缓存复用）、`markdown.js`（frontmatter/标题锚点/显式链接）、`index.js`（ProjectIndex 构建、实体、历史解析、Git 扫描）、`relations.js`（正式关系与目标解析）、`diagnostics.js`、`projections.js`（兼容快照投影 + 首页导读）、`entity-detail.js`（实体详情/原文投影与 ID 安全校验）、`search.js`（结构化搜索）、`history.js`（语义历史时间线）、`graph.js`（decision/ticket 依赖 DAG）、`relation-graph.js`（局部关系图）。
- `src/server/`：`refresh-store.js`（指纹轮询、完整重建、原子替换、stale）、`static.js`（同源静态资源与安全头）、`markdown-render.js`（受限 markdown-it 渲染：html 关闭、linkify/图片禁用、链接按解析状态应用安全规则）。
- `src/web/`：`index.html` + `app.js`（History API 路由、SSE 协调、视图分发）+ `views/*.js`（八个视图纯函数）+ `graph.js`（原生 SVG 有界图布局）+ `styles.css`（编辑式极简）。
- API：`/api/snapshot`、`/api/entities/:id`、`/api/entities/:id/raw`、`/api/search`、`/api/history`、`/api/graph`、`/api/relations`、`/events`；客户端只按稳定实体 ID 请求，静态资源与 API 拒绝路径穿越，响应带明确 MIME、`nosniff` 与同源 CSP。

## 依赖与质量

- 唯一生产依赖：`markdown-it`（受限配置）。客户端无框架、无构建链、无图形/状态库；原生 ESM + History API + 原生 SVG。
- 自动化测试只用 Node 20 内置 `node:test`：`npm test` 覆盖正常、错误、安全、SSE/stale、图文投影、Colombia 形状与规模 fixture（≥250 SourceDocument、100 decision/ticket、2000 历史条目、1000 正式关系）；性能门槛为完整索引构建中位值 ≤2 秒、热索引投影 ≤200 ms、变更到 SSE ≤3 秒。
- 浏览器可用性（键盘/焦点、移动单列、reduced motion、深链接、Back/Forward、极简视觉）由 Chrome/Edge 人工发布清单验收，首版不引入浏览器自动化。

完整依据与验收决策见 [dashboard 项目全景工作台决策地图](../../../.wayfinding/dashboard-project-atlas/map.md)；逐项验收由本页“依赖与质量”的契约与自动化测试承载。

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
