---
交付类型: 重构
状态: 关闭
认领者: "01a00f46-db9f-7b8a-887d-b7fcd0e175b8"
硬依赖: []
来源规格: ../spec.md
---

# 建立可诊断的 ProjectIndex 与兼容快照

## 交付结果

Dashboard 从受支持项目资料建立唯一的、有类型的只读 `ProjectIndex`，并从它生成兼容快照和刷新状态；未知、缺失、冲突、越界和读取失败成为可定位诊断，而不是静默汇总。

## 当前行为

`dashboard/src/dashboard.js` 分散扫描资料并直接生成聚合 DTO；未知状态、损坏资料和刷新失败缺少完整且可查询的诊断模型。

## 期望行为

`ProjectIndex` 成为资料、实体、显式关系、反向关系、诊断和快照时间的唯一来源。`createSnapshot`、`startDashboard` 与 `/api/snapshot` 继续可用，但只返回该索引的投影。成功重建才原子替换；失败保留最后成功快照并标为 stale。

## 关键契约

- 资料只解析一次；ID 使用仓库相对 POSIX 形式，不泄露绝对路径。
- 正式关系只来自目录契约、明确字段、Markdown 链接、当前依据、来源、evidence、代码锚点和有效 Git 事实；保留 provenance 与解析状态。
- 可选资料缺失为“未配置”；未知前置字段、未解析依赖和冲突不能默认成成功、打开或 ready。
- `cs web` 继续只监听 `127.0.0.1`，不提供写入端点。

## 验收标准

- [x] 当前态、工作状态、历史、Git 与技能资料均作为有来源类别和 validity 的索引资料出现。
- [x] decision/ticket 生命周期和 readiness 从状态、认领者与依赖派生；缺失或未知依赖保留 unknown/blocked 与诊断。
- [x] 坏链接、未知枚举、重复 ID、历史格式错误、越界路径、Git/读取失败都可由来源和位置定位。
- [x] `/api/snapshot`、`createSnapshot` 和 `startDashboard` 的既有公开用途继续工作，且结果来自 `ProjectIndex` 投影。
- [x] 变更成功后产生新快照；重建失败时保留最后成功快照并公开 stale 状态。
- [x] Node 测试覆盖正常、缺失、冲突、错误和 stale 路径。

## 范围外

- 页面、阅读器、搜索、图与客户端路由。
- 持久化索引、文件监听器或复杂增量索引。

## 实施结果

按决策 08 的模块边界落地服务端核心，单文件 `dashboard.js` 拆为兼容入口 + 模块：

- `src/project/root.js`：项目根发现。
- `src/project/markdown.js`：frontmatter（含中文键与列表）、标题锚点、显式链接提取。
- `src/project/sources.js`：受支持资料位置契约（当前态/工作状态/历史/读者/技能），其余 Markdown 归为 unindexed；SourceDocument 只解析一次并带缓存复用。
- `src/project/index.js`：`ProjectIndex{schemaVersion, project, sources, entities, relations, diagnostics, generatedAt}`；17 类实体与稳定 ID（`<kind>:<relpath>`、`HistoryEntry:<month>:<date>:<seq>`、`CodeAnchor:<path>:<symbol>`、`GitCommit:<fullhash>`）；Decision/Ticket readiness（frontier/ready、claimed、blocked、none、unknown）从状态、认领者、依赖解析派生；ADR 状态；历史条目完整字段才计数。
- `src/project/relations.js`：8 种正式关系 kind，`resolved|unresolved|external|unsafe` 解析状态，provenance 记录来源字段；反向引用派生；commit evidence 经 `git rev-parse` 验证；非 Markdown 目标经带缓存文件探测解析为 `file:` 端点。
- `src/project/diagnostics.js`：`error|warning|info` 可定位诊断（unknown-enum、missing-field、duplicate-id、bad-link、missing-dependency、path-escape、history-format、read-failed、git-unavailable 等）。
- `src/project/projections.js`：兼容快照投影（maps/deliveries/history/git/skills/project + schemaVersion + snapshot 状态 + 诊断摘要），全部由索引派生。
- `src/server/refresh-store.js`：指纹轮询、完整重建、原子替换；成功才替换并广播 `snapshot-changed`，失败保留最后成功索引并标记 stale、广播 `snapshot-stale`。
- `src/dashboard.js`：保留 `cs web`、`parseWebArguments`、`findProjectRoot`、`createSnapshot`、`startDashboard`、`/api/snapshot`、`/events` 公开边界；SSE 事件名按决策 08 升级为 `snapshot-changed`/`snapshot-stale` 并保留旧 `update` 兼容内嵌页面；请求 handler 异常返回 500 而非挂起。

行为变化（规格要求的契约修正）：带认领者的打开项为 claimed 而非 blocked；未知状态枚举不再默认成打开；不完整历史条目不再计数且保留行号诊断；`.tmp/`、`node_modules`、`.git` 不进入指纹与资料枚举。

## 验证证据

- `dashboard` 目录执行 `npm test`：10 项测试全部通过（4 项既有基线 + 6 项新增：typed index、unknown enums/bad links/path escape、history format、read failure、unconfigured、stale 保留与 SSE snapshot-stale），单次运行约 1.5 秒。
- 真实 CodeStable 项目冒烟：`createSnapshot(process.cwd())` 产出 0 error / 4 warning（均为格式文档示例链接），41 条 depends-on 全部 resolved，41 条 evidence（Git commit 经真实 `git rev-parse` 验证）、24 条 current-basis、8 条代码锚点关系；地图 10/10 决策关闭；delivery 9 张 ticket 1 claimed 8 blocked（与真实状态一致）；历史 2026-08 8 条、2026-07 4 条有效，invalid 0。
- HTTP/SSE 冒烟：`startDashboard` 后 `/api/snapshot` 返回 200 与 `status: fresh`；修改历史文件后收到 `event: snapshot-changed`；`stop()` 干净退出。
- 测试命令：`cd dashboard && npm test`。
