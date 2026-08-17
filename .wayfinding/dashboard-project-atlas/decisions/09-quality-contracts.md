---
处理方式: 裁决
状态: 关闭
认领者: "01a00ecd-9d9b-781e-b87d-09545ad60a49"
硬依赖: [03-first-open-information-architecture.md, 04-reading-and-context-interaction.md, 05-temporal-and-graph-views.md, 06-document-discovery.md, 07-interface-prototype.md, 08-technical-architecture.md]
---

# 确定质量与验证契约

## 问题

哪些可检查的可访问性、键盘导航、响应式、性能、数据规模、错误呈现、自动刷新和自动化测试标准，足以证明 dashboard v2 在真实 CodeStable 项目中可理解、可靠且不会掩盖输入错误？

## 答案

采用**Node 契约/API/SSE 自动化 + 手工浏览器发布清单**。不引入 Playwright、浏览器二进制、截图测试或浏览器矩阵；`npm test` 保持只使用 Node 20 内置 `node:test`。浏览器可用性仍是发布条件，但以可重复的人工清单证明，而不是伪称自动覆盖。

### 强制自动化层

1. **项目索引和解析单元测试**：稳定 ID、来源权威、标题锚点、关系与反向关系、确定性排序；decision/ticket 的生命周期和 readiness 派生；可选目录未配置；缺失 frontmatter、未知枚举、重复 ID、坏链接、缺失硬依赖、仓库外路径、格式错误历史和 Git 不可用的定位诊断。未知数据不得默认成成功、打开或 ready。
2. **Markdown 和安全单元测试**：原始 HTML 只作为文本、危险 URL 不可点击、图片禁用、外部链接具有安全语义；API 仅接受稳定实体 ID，不接受任意文件路径、绝对路径或路径穿越。
3. **HTTP/SSE 集成测试**：`/api/snapshot`、实体详情、原文、结构化搜索、局部关系和 SSE 的正常、无效和不可用来源路径；静态资源 MIME、`nosniff`、CSP、环回监听；资料变更的更新事件，以及重建失败后保留最后成功快照并发出 stale 状态。
4. **可测试视图数据契约**：每个页面投影、图的文本等价列表、状态/边方向/截断说明都作为纯数据或纯字符串输出由 Node 断言；图最多 20 节点、40 边，超限时必须带剩余数和完整文本关系。

### 浏览器发布清单

每次首版发布、路由/阅读/图/样式/刷新逻辑变更后，在当前稳定 Chrome 或 Edge 完成人工验收；不承诺 Firefox、Safari 或跨浏览器自动化。必须分别检查 1280px 与 390px：

- 概览可进入当前态、探路、交付、历史、文档和关系；深链接、刷新、Back/Forward 保持同一实体或展示可返回诊断。
- 键盘可完成导航、筛选、阅读跳转、检查器/移动详情开关和图逐层展开；打开后焦点进入，关闭后回到触发控件。
- 图与文字关系列表一致；状态、边方向、截断、未解析关系和 stale 不能只依赖颜色、位置或 hover。
- 移动端为单列，无横向遮挡；`prefers-reduced-motion` 无非必要动效。
- 自动刷新不整页 reload，尽可能保留实体、筛选、检查器、阅读位置和焦点；删除目标或刷新失败时出现诊断和安全返回入口。
- 页面遵守已确认的编辑式极简规范：无渐变、玻璃拟态、重阴影、禁用字体和 emoji。

人工清单的执行人、浏览器版本、视口、资料样本、日期和结果必须写入对应 ticket 的验证证据；未完成清单不能标记浏览器验收通过。

### 规模与性能

建立不依赖外部绝对路径的可重复 fixture，至少包含 250 个 `SourceDocument`、100 个 decision/ticket、2,000 条历史条目和 1,000 条正式关系；另以 fixture 复现 `08-colombia-package` 的已闭合 decision DAG 与进行中 ticket DAG。Node 20 标准开发/CI 环境中：首次完整 `ProjectIndex` 构建中位值不超过 2 秒，热索引概览/实体/结构化搜索响应不超过 200 ms，默认轮询从变更到 SSE 通知不超过 3 秒。性能测试记录固定次数的中位值；超阈值是回归，不能靠忽略单次尖峰或缩小输入来掩盖。

### 失败与范围

所有失败路径必须通过 fixture 或依赖注入稳定复现，尤其是 malformed 输入、未解析关系、Git 不可用、文件读取失败和 refresh rebuild 失败。首版不自动化浏览器 DOM、视觉像素或多浏览器行为；这是有意接受的残余风险，靠发布清单和可测试的页面数据契约降低，后续如频繁出现 UI 回归再独立裁决是否引入浏览器自动化。

## 依据

- 用户选择方案 B，拒绝引入 Playwright 的浏览器下载、运行时间和用例维护成本。
- 当前 `dashboard` 只有 4 个 Node 测试，已覆盖快照、刷新、项目发现和 CLI；v2 的索引、错误、API、SSE、安全和投影须以 Node 自动化补齐。
- [盘点可展示资料与显式关系](01-artifact-contracts.md) 要求不掩盖未知、缺失、冲突、坏链接与 stale 快照，故失败 fixture 和诊断断言是强制门禁。
- [确定阅读与上下文交互](04-reading-and-context-interaction.md) 与 [区分时间线、依赖图与关系图](05-temporal-and-graph-views.md) 要求键盘、焦点、移动端、文字替代、局部图限制和刷新保留上下文；在无浏览器自动化下，这些由明确的 Chrome/Edge 手工发布清单承担。
- [确定 dashboard v2 技术边界](08-technical-architecture.md) 已限定无框架、原生 ESM 与 `markdown-it` 唯一生产依赖；本决策不新增任何测试依赖。
