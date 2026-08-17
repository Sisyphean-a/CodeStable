---
处理方式: 裁决
状态: 关闭
认领者: "01a00ecd-9d9b-781e-b87d-09545ad60a49"
硬依赖: [01-artifact-contracts.md]
---

# 定义项目实体与关系模型

## 问题

Dashboard 应采用什么统一实体、标识、状态和关系模型，才能在不复制权威内容、不混淆不同生命周期、也不制造推断事实的前提下支撑项目概览、文档阅读、历史、探路、交付和关系探索？

## 答案

采用**有类型的只读项目索引**。它是每次扫描在内存中生成的派生快照，不是图数据库、不写回项目文件，也不建立第二份权威内容。所有页面都从该索引生成投影视图，不再分别解释原始 Markdown。

### 顶层结构

```text
ProjectIndex
├─ schemaVersion
├─ project
├─ sources
├─ entities
├─ relations
├─ diagnostics
└─ generatedAt
```

- `schemaVersion` 允许 API 与客户端显式处理模型演进。
- `project` 保存项目根、显示名及 Git/运行环境概要，不承载文档正文。
- `sources` 每个仓库文件只解析一次。
- `entities` 保存可以独立定位、阅读或建立关系的有类型对象。
- `relations` 只保存结构契约或原文明确表达的关系。
- `diagnostics` 保存缺失、冲突、未知格式和不可用来源，错误不是日志旁路。

### 资料源

```text
SourceDocument
- id
- path
- category
- frontmatter
- headings
- content
- validity
- modifiedAt
```

`SourceDocument` 是原文的唯一内存表示。实体通过 source locator 引用它，不复制正文。`category` 保留当前态、工作状态、历史、读者文档、技能、环境证据等来源类别；`validity` 只表示解析质量，不表示业务生命周期。

### 实体公共字段

```text
Entity
- id
- kind
- title
- source
- authority
- validity
- sourceOrder
```

- `source` 包含资料源 ID，以及可选标题锚点、结构化字段、条目序号或文本范围。
- `authority` 明确保留 `environment`、`current-state`、`work-state`、`history`、`reader-document`、`evidence` 等层级，不把展示顺序误当成权威顺序。
- `validity` 使用 `valid | partial | invalid | unavailable`。
- `sourceOrder` 只保存原始契约顺序；不同页面的最终排序由各自投影决定。

### 实体类型

首版模型至少包含：

```text
Project
AttentionDocument
ArchitectureIndex
ArchitectureDocument
RequirementIndex
RequirementDocument
ADR
ReaderDocument
Skill
DecisionMap
Decision
Delivery
Specification
Ticket
HistoryEntry
GitRepository
GitCommit
CodeAnchor
```

`Document` 可以作为代码层公共基型，但不能成为抹平语义的唯一运行时类型。页面必须能够区分当前架构文档、历史条目、决策项和 ticket。

### 生命周期与派生状态

不建立含义模糊的全局 `status`。每种实体拥有自己的状态契约：

```text
Decision
- state: open | closed | unknown
- owner
- readiness: frontier | blocked | claimed | none | unknown

Ticket
- state: open | closed | unknown
- owner
- readiness: ready | blocked | claimed | none | unknown

ADR
- state: accepted | superseded | unknown

GitRepository
- state: clean | changed | unavailable
```

- `readiness` 必须从当前状态、认领者和已解析硬依赖派生，不持久化回项目。
- 缺失依赖、未知状态或无效字段产生 `unknown` 或 `blocked`，绝不能回退为 open、ready 或成功。
- 文档解析质量只进入 `validity`，不能和 decision/ticket 的生命周期混用。

### 稳定标识

不向项目文件写入 UUID。标识由现有稳定身份确定，并包含类型前缀以防不同对象误合并：

- 文件级实体：`<kind>:<repository-relative-path>`。
- map、decision、delivery、spec 和 ticket：使用其稳定仓库相对路径。
- 文档标题段落：文件 ID 加规范化标题锚点；重复标题追加在该文件中的出现序号。
- 历史条目：月文件路径、日期和同日条目顺序；同日顺序来自历史格式的稳定写入规则。
- Git commit：完整 commit hash。
- 代码锚点：仓库相对路径加显式符号名；只有原文给出行号时才使用行定位。
- 无法形成稳定定位的原文片段只保留为 source locator 或 diagnostic，不提升为实体。

所有 ID 使用仓库相对 POSIX 路径并统一 URL 编码；Windows 绝对路径不能进入公开 ID。

### 正式关系

```text
Relation
- id
- from
- to
- kind
- provenance
- resolution
```

`kind` 首版限定为：

```text
contains
links-to
depends-on
source-of
current-basis
evidence
supersedes
code-anchor
```

- `provenance` 必须记录关系来自哪个资料源、字段、Markdown 链接或结构契约。
- `resolution` 使用 `resolved | unresolved | external | unsafe`。
- 未解析目标仍保留关系和原始目标文本，使坏链接、缺失依赖和外部引用可见。
- 反向引用由同一关系派生，不重复存储另一条事实。
- 目录包含关系属于结构契约；Markdown 链接和 frontmatter 字段属于显式关系。二者都可作为正式关系，但来源必须可区分。

标题相似、关键词接近、修改时间相近等启发式结果不进入 `relations`。若后续确需提供发现建议，只能进入独立的 `suggestions` 投影并明确标为推断；首版不要求该集合。

### 诊断模型

```text
Diagnostic
- id
- severity
- code
- source
- location
- message
- relatedTarget
```

`severity` 使用 `error | warning | info`。诊断至少覆盖：

- 必需文件或字段缺失。
- 未知枚举和无效 frontmatter。
- 坏链接、缺失依赖和仓库外路径。
- 重复实体 ID 或相互冲突的显式字段。
- 当前态与低权威资料冲突。
- Git 证据不存在。
- 来源读取失败与快照过期。

诊断可以关联实体和未解析关系，但不能通过删除原始对象来“修复”视图。

### 排序契约

索引本身不声明一个全局业务排序，只保留确定性字段：

- 历史按历史格式的日期和同日写入顺序。
- 决策项与 tickets 优先按地图/规格中的显式链接顺序，其次按编号文件名。
- 当前态入口按架构和领域索引中的链接顺序。
- 无显式顺序的对象使用规范化仓库路径作为稳定回退。

首页、搜索、时间线和图视图分别定义自己的投影排序，不能修改索引中的来源顺序。

### 页面投影

现有 `maps[]`、`deliveries[]`、`history[]` 等结构可以继续作为 API 或视图层的只读投影，但它们必须由 `ProjectIndex` 生成。任何页面不得绕过索引重新读取并解释项目文件。这样既保留简单页面数据，又让跨页面关系、错误状态和反向引用只有一个计算来源。

## 依据

- [盘点可展示资料与显式关系](01-artifact-contracts.md)：已确认资料类别、权威顺序、正式关系来源及错误呈现契约。
- `skills/cs-domain/references/memory-model.md`：当前代码、当前态、历史、工作状态和证据具有不同权威层级，不能相互覆盖。
- `skills/cs-wayfinder/references/local-map.md` 与 `skills/cs-to-tickets/references/delivery-surface.md`：decision、ticket 的状态、认领者、硬依赖及派生前沿具有不同于文档有效性的生命周期。
- 当前 `dashboard/src/dashboard.js` 为每个页面分别生成汇总 DTO，无法保留正文、来源层级、未解析关系和统一诊断；投影兼容可以降低后续迁移风险。
- 用户裁决采用方案 C：有类型的项目索引，由统一索引派生页面；明确不采用各页面独立 DTO 作为权威模型，也不采用只有通用 node/metadata 的松散文档图。
- 该模型只规定语义边界；具体模块拆分、API 传输、缓存与第三方依赖留给 [确定 dashboard v2 技术边界](08-technical-architecture.md)。
