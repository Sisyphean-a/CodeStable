---
处理方式: 原型
状态: 关闭
认领者: "01a00ecd-9d9b-781e-b87d-09545ad60a49"
硬依赖: [03-first-open-information-architecture.md, 04-reading-and-context-interaction.md, 05-temporal-and-graph-views.md, 06-document-discovery.md]
---

# 制作并判断低成本界面原型

## 问题

哪一个低成本、使用真实项目内容的可交互界面原型，足以让用户判断首次打开是否能理解项目、关键阅读路径是否顺畅，并验证界面严格符合指定 minimalist UI 规范？

## 答案

采用一个基于真实 `08-colombia-package` 资料的单页交互原型，验证以下体验：

- 首页用短标签与阅读路径建立项目理解，不重复解释文档正文。
- 当前态以独立阅读页与按需信息检查器呈现。
- 探路使用实际 decision 硬依赖 DAG，而不是线性阶段或纯文本列表。
- 交付使用实际 ticket 硬依赖 DAG、状态分布和当前可行动项，而不是合成工作流。
- 文档按权威类别进入阅读页。

用户确认原型通过。图的**语义、状态、依赖和文字替代**属于已确认契约；具体图形表现“感觉”的微调可以在实施阶段迭代，但不得将探路或交付退回为纯文本主视图、线性伪流程或无依据关系图。

## 依据

- 原型产物为可丢弃工作状态（`.tmp/dashboard-project-atlas-prototype.html`），只用于本次判断，判断结论记录于本项后已随工作状态清理，不进入 `dashboard/`、构建、测试或静态资源；已用 `git check-ignore` 验证其由现有 `.gitignore` 的 `.tmp/` 规则排除。
- 用户首轮判断：方向通过；要求减少重复说明文案，并把探路和交付从纯文本改成更合适的图形化路线/工作线路。
- 用户提供真实样本：`E:/h5-credit-monorepo/.wayfinding/08-colombia-package/`。只读检查确认：地图有 13 个已关闭 decision、无打开项和迷雾；同一地图下有一份规格和 11 张 ticket。
- 原型已切换为真实样本：探路页绘制 13 个实际 decision 与 7 条硬依赖；交付页绘制 11 张 ticket 与 24 条硬依赖，状态为 5 closed、1 claimed、3 ready、2 blocked。它不再使用线性阶段或“无 delivery”的合成数据。
- 概览入口和状态说明已压缩为短标签；正文细节只保留在阅读页和按需信息检查器。
- 静态检查通过：真实状态、图页路由和内嵌脚本有效；未发现渐变、玻璃拟态、阴影、Inter/Roboto/Open Sans 或 emoji。HTML LSP 因环境缺少 `vscode-html-language-server` 无法运行。
- 已用 `git check-ignore` 验证 `.tmp/dashboard-project-atlas-prototype.html` 由现有 `.gitignore` 的 `.tmp/` 规则排除，且该工作状态随任务完成一并清理。
- 用户最终复核：真实项目版通过；图的具体视觉感觉可在实施中继续调整，但图形化路线/工作线及其真实语义必须保留。
