# Dashboard v2.0 项目全景工作台

## 问题

现有 dashboard 将项目资料压缩为计数、百分比和少量 Git 摘要，无法让接手者或重新进入项目的人理解当前有效依据、语义演变、探路与交付状态，以及对象间有依据的关系。它还会把未知输入、缺失资料或刷新失败静默降级为正常汇总。

## 目的地

在保持 `cs web`、Node.js 20+、本机 `127.0.0.1`、只读和 SSE 自动刷新的公开边界下，交付一个以**项目理解**为首要目标的完整 dashboard v2.0。用户打开概览后能够进入权威资料、历史、探路、交付、文档和关系，并沿可定位的显式关系连续调查；当前行动只作为持续可见的辅助信息。

v2.0 只在所有资料面组成完整理解闭环后发布；实施依次经过可信阅读核心、发现与演变、当前工作、关系与发布硬化四个内部切片，但中间切片不是公开 v2。

## 用户可观察行为

### 概览与导航

来源：[03：首次打开的信息架构](../decisions/03-first-open-information-architecture.md)、[07：界面原型判断](../decisions/07-interface-prototype.md)。

- 首页按“项目身份 → 权威阅读路径 → 当前项目地图 → 语义演变 → 当前注意力 → 继续入口”的顺序提供项目导读，而不是统计大屏或无边界卡片墙。
- 固定导航提供概览、当前态、探路、交付、历史、文档和关系入口。可选来源未配置时显示“未配置/无资料”，不显示零进度。
- 用户可看见当前快照是否有效、部分有效、无效、不可用或 stale；诊断包含资料来源和可定位位置。

### 阅读与连续调查

来源：[04：阅读与上下文交互](../decisions/04-reading-and-context-interaction.md)。

- 任何可阅读对象都可从列表、时间线、关系或图进入独立、可深链接的阅读状态；URL 使用稳定实体 ID，不泄露绝对路径。
- 正文是阅读页主内容。用户可显式打开一跳“信息/关系”检查器，查看类型、权威、来源、范围、生命周期、readiness、代码锚点、关系、反向引用、诊断和快照状态。
- 刷新、复制 URL、浏览器 Back/Forward 会恢复对象和共享状态；当前对象消失或无效时显示目标 ID、诊断和安全返回入口，而不静默跳回概览。
- 原始 Markdown 以同源只读入口提供；外部目标带解析状态并以安全新标签页打开。dashboard 不打开编辑器、终端或自定义 URI，也不提供任何修改操作。

### 发现、历史与工作状态

来源：[01：资料与显式关系契约](../decisions/01-artifact-contracts.md)、[05：时间线、依赖图与关系图](../decisions/05-temporal-and-graph-views.md)、[06：文档发现与搜索边界](../decisions/06-document-discovery.md)。

- 文档按当前态、工作状态、演变/证据、读者/技能资料分类，并明确来源类别和权威层级。结构化搜索只匹配标题、路径、标题目录、类型、范围、来源类别、权威、状态/readiness、历史字段、关系类型和代码锚点；支持中文关键词、大小写不敏感英文、路径片段、多词匹配和可见筛选。
- 未索引 Markdown 只能在用户明确切换到“未索引文档”范围时出现；不提供全文、语义、模糊或 AI 搜索。
- 历史页默认是按语义历史格式排序的时间线。Git 提交、代码路径和原始来源只作为历史条目的 evidence，不冒充另一条提交时间线。
- 探路和交付默认展示行动列表：decision 为当前前沿/已认领/被阻塞/已关闭，ticket 为 Ready/已认领/被阻塞/已关闭。每项显示标题、状态、认领者、直接可行动或阻塞原因及硬依赖数。

### 图与关系

来源：[02：实体与关系模型](../decisions/02-entity-relation-model.md)、[05：时间线、依赖图与关系图](../decisions/05-temporal-and-graph-views.md)。

- decision、ticket、文档关系和历史演变按各自真实结构分开表达，永不混成统一“变更树”或默认全局知识图。
- 用户可从探路或交付行动列表按需打开各自的硬依赖 DAG；上游在左、被依赖对象在右，边表示 `depends-on`，并显示方向、状态、解析状态和图例。
- 阅读页默认以文字显示一跳关系；关系页才显示局部关系图。图初始只显示选中对象及一跳，用户手动逐层展开。
- 图最多显示 20 个节点和 40 条边；超限时显示确定性截断范围与剩余数，且始终提供完整的文字关系/依赖列表。颜色、位置或 hover 不是唯一信息载体。

### 刷新、错误与可访问性

来源：[01：资料与显式关系契约](../decisions/01-artifact-contracts.md)、[04：阅读与上下文交互](../decisions/04-reading-and-context-interaction.md)、[09：质量与验证契约](../decisions/09-quality-contracts.md)。

- 资料变化后页面局部刷新数据，不整页 reload；尽可能保留选中对象、筛选、图展开深度、检查器、阅读位置和焦点。
- 刷新重建失败时继续展示最后成功快照，并明确标记 stale 和本次失败；缺失、冲突、未知字段、坏链接、未解析依赖、非法路径、读取失败和 Git 不可用必须保留为诊断，不得伪装成成功或空集合。
- 桌面阅读以正文为主，检查器按需展开；移动端为单列，导航和详情使用显式可访问控件。键盘可完成导航、跳转、筛选、检查器/详情开关与图逐层展开；打开详情时焦点进入，关闭时回到触发控件。`prefers-reduced-motion` 时不播放非必要动画。
- UI 使用编辑式极简语言：暖色单色、清晰排版、留白、轻边框和低饱和语义色；不使用渐变、玻璃拟态、重阴影、霓虹、大面积主色、通用 SaaS 装饰、Inter/Roboto/Open Sans 或 emoji。

## 实现决定

来源：[01：资料与显式关系契约](../decisions/01-artifact-contracts.md)、[02：实体与关系模型](../decisions/02-entity-relation-model.md)、[08：技术边界](../decisions/08-technical-architecture.md)、[10：版本范围与验收切片](../decisions/10-release-scope.md)。

- 每次扫描构建一个只读、有类型的 `ProjectIndex`，包含 `schemaVersion`、`project`、`sources`、`entities`、`relations`、`diagnostics` 和 `generatedAt`。每个资料源只解析一次；页面、API、搜索和图只消费其投影。
- 实体具有稳定的类型前缀、仓库相对 POSIX ID、来源 locator、authority、validity 和类型专属生命周期。decision 与 ticket 的 readiness 由当前状态、认领者和硬依赖派生，不写回项目文件；未知、缺失和冲突保留为 unknown/blocked/diagnostic。
- 正式关系只来自目录契约、frontmatter、Markdown 链接、当前依据、来源、证据、代码锚点和可验证 Git 事实。关系保留 `kind`、provenance 和 `resolved | unresolved | external | unsafe`；反向关系派生，不重复存储。相似度和启发式推断不进入首版正式关系。
- 代码从现有 `dashboard/src/dashboard.js` 渐进拆分为项目根/资料/Markdown/索引/关系/诊断/投影、HTTP/刷新/静态资源，以及原生 ESM 客户端、视图、SVG 图布局和样式模块。`bin/cs.js` 保持命令分发；`startDashboard`、`createSnapshot` 和 `/api/snapshot` 继续作为兼容入口与投影。
- API 至少提供轻量快照、实体详情、原始 Markdown、结构化搜索、局部关系和 SSE。客户端请求仅使用稳定实体 ID，不能传入任意路径；静态资源与 API 拒绝路径穿越，使用明确 MIME、`nosniff` 和仅同源的 CSP。
- 仅新增 `markdown-it` 一个生产依赖，在服务端关闭原始 HTML、自动 linkify 和图片渲染，并为链接应用安全规则。客户端使用 History API、原生 DOM、原生 SVG；不引入前端框架、构建链、图形库、状态库或客户端路由库。
- 启动时建立完整索引；轮询受支持资料根和 Git 元数据。变化后后台重建完整索引，只有无致命错误才原子替换并发送 SSE；失败时保留最后成功快照并标记 stale。首版只在内存中按路径/文件元数据复用未变化资料，不实现持久化索引、文件监听器或复杂增量关系计算。
- v2.0 内部交付顺序固定为：S1 可信阅读核心、S2 发现与演变、S3 当前工作、S4 关系与发布硬化。每一切片保留此前测试，S4 验收通过后删除被替代的旧扫描、内嵌页面和重复 DTO 逻辑。

## 测试决定

来源：[09：质量与验证契约](../decisions/09-quality-contracts.md)。

- 自动化只使用 Node 20 内置 `node:test`，不引入 Playwright、浏览器二进制、视觉截图或跨浏览器矩阵。
- 单元测试覆盖索引、稳定 ID、权威、标题锚点、显式关系、反向关系、确定性排序、状态/readiness，以及缺失 frontmatter、未知枚举、重复 ID、坏链接、缺失硬依赖、越界路径、错误历史和 Git 不可用。
- Markdown/安全测试覆盖原始 HTML 文本化、危险 URL 不可点击、图片禁用、外部链接安全语义、稳定实体 ID API 与路径穿越拒绝。
- 集成测试覆盖快照、实体、原文、搜索、关系、SSE、CSP、`nosniff`、MIME、环回监听、成功刷新，以及 refresh rebuild 失败时的 stale 保留。页面投影、图的文字等价、边方向、状态和截断说明以纯数据或字符串由 Node 断言。
- 使用可重复 fixture：至少 250 个 `SourceDocument`、100 个 decision/ticket、2,000 条历史条目和 1,000 条正式关系；另以 fixture 复现 Colombia 样本的已闭合 decision DAG 与进行中 ticket DAG。Node 20 标准开发/CI 环境中，完整索引构建中位值不超过 2 秒，热索引概览/实体/结构化搜索不超过 200 ms，变更到 SSE 通知不超过 3 秒。
- 每次首版发布，以及路由、阅读、图、样式或刷新逻辑变更后，人工在当前稳定 Chrome 或 Edge 以 1280px 和 390px 复核完整导航、深链接、Back/Forward、键盘/焦点、图文一致、移动单列、reduced motion、SSE 上下文保留、错误回退与极简视觉禁用项。执行人、版本、视口、资料样本、日期和结果必须写入 ticket 验证证据。

## 验收标准

- [ ] `cs web` 继续只监听 `127.0.0.1`、无认证和写入端点；没有 `.codestable` 时仍失败退出。
- [ ] 概览、当前态、探路、交付、历史、文档和关系均可从固定导航到达，并通过真实项目资料解释项目而不是只显示汇总数字。
- [ ] 当前态、工作状态、历史、Git evidence 和读者/技能资料保留来源类别与权威层级；可选资料缺失显示未配置，不显示零进度。
- [ ] 实体 ID、关系、反向引用、源码 locator 和诊断都可定位且不泄露 Windows 绝对路径；每个页面投影仅来自 `ProjectIndex`。
- [ ] 阅读页可深链接、显示完整正文与原文入口；检查器按需显示一跳上下文。无效、删除或不可用实体显示诊断和返回入口。
- [ ] 结构化搜索只搜索已确认字段，支持中文、英文、路径片段、多词和可见筛选；结果显示命中字段、来源/权威、路径或范围和 validity。
- [ ] 历史是语义时间线，只有有效格式条目被计数；Git 仅以 evidence 呈现。
- [ ] 探路和交付默认显示行动列表；decision 与 ticket DAG 分开、有方向、有文字替代，且局部图不超过 20 节点/40 边。
- [ ] 局部文档关系图只使用显式关系；unresolved、external 和 unsafe 关系可见但不伪造成功跳转。
- [ ] 缺失、冲突、未知、非法路径、读取/Git 失败和 refresh rebuild 失败都产生可定位诊断；刷新失败时展示 stale 的最后成功快照。
- [ ] Markdown、API、静态资源和外部链接符合既定安全边界；客户端不能通过请求读取任意路径。
- [ ] 自动化 Node 测试覆盖所列正常、失败、安全、刷新和规模 fixture；性能门槛均通过。
- [ ] Chrome 或 Edge 的 1280px/390px 手工发布清单有无阻塞记录；键盘、焦点、移动端、reduced motion、刷新保留和极简视觉规范通过。
- [ ] S1–S4 的各自验收均完成，旧单文件扫描/页面/DTO 已被替代实现删除，且 `startDashboard`、`createSnapshot` 与 `/api/snapshot` 的兼容投影无回归。

## 范围外

来源：[地图范围外](../map.md)、[08：技术边界](../decisions/08-technical-architecture.md)、[10：版本范围与验收切片](../decisions/10-release-scope.md)。

- 远程访问、认证、多人协作、任何写入、认领或关闭操作。
- 通用代码浏览器、完整 Git 客户端、Issue Tracker 和项目管理功能。
- 全文、向量、AI、模糊或语义搜索；推断关系与自动文档修复。
- 默认全局知识图、物理模拟网络、无限深度图、无边界图形布局。
- 文件监听器、持久化索引、复杂增量索引、导出、收藏和个性化布局。
- Playwright、浏览器自动化、视觉像素测试和跨浏览器矩阵。

## 来源

- [Dashboard 项目全景工作台地图](../map.md)
- [01：资料与显式关系契约](../decisions/01-artifact-contracts.md)
- [02：实体与关系模型](../decisions/02-entity-relation-model.md)
- [03：首次打开的信息架构](../decisions/03-first-open-information-architecture.md)
- [04：阅读与上下文交互](../decisions/04-reading-and-context-interaction.md)
- [05：时间线、依赖图与关系图](../decisions/05-temporal-and-graph-views.md)
- [06：文档发现与搜索边界](../decisions/06-document-discovery.md)
- [07：界面原型判断](../decisions/07-interface-prototype.md)
- [08：技术边界](../decisions/08-technical-architecture.md)
- [09：质量与验证契约](../decisions/09-quality-contracts.md)
- [10：版本范围与验收切片](../decisions/10-release-scope.md)
- [仪表盘包当前态](../../../.codestable/architecture/packages/dashboard.md)
- [当前实现入口](../../../dashboard/src/dashboard.js)
- [当前测试入口](../../../dashboard/test/dashboard.test.js)
