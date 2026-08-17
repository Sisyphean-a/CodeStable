---
交付类型: 功能
状态: 关闭
认领者: "01a00f46-db9f-7b8a-887d-b7fcd0e175b8"
硬依赖: [01-project-index-and-snapshot.md, 02-project-guide-and-navigation.md]
来源规格: ../spec.md
---

# 交付深链接的安全文档阅读

## 交付结果

用户可从 v2 视图打开任何可读实体的独立阅读页，查看受限 Markdown 正文和原文，并按需打开一跳上下文检查器；无效对象有可定位诊断和安全返回。

## 当前行为

现有 dashboard 不提供实体正文、稳定实体阅读链接、原文入口或关系/诊断检查器。

## 期望行为

阅读页以正文为主，URL 使用实体稳定 ID。检查器默认关闭，按需显示类型、authority、来源、范围、状态/readiness、代码锚点、关系、反向引用、诊断和快照状态；移动端降级为单列与显式详情入口。

## 关键契约

- Markdown 使用受限服务端渲染：原始 HTML 文本化、自动 linkify 与图片关闭；外部链接使用安全新标签页。
- 原文和 API 只以稳定实体 ID 定位，不能接收任意路径或泄露绝对路径。
- 键盘可打开/关闭检查器，打开时焦点进入、关闭时返回触发控件；reduced-motion 不播放非必要动画。

## 验收标准

- [x] 可读实体有深链接正文页、同源原文入口和复制仓库相对路径能力。
- [x] 检查器只显示当前实体的一跳上下文，并明确 relation kind、解析状态和诊断。
- [x] 删除、无效或不可用目标保留原始目标 ID，显示诊断和返回入口，不静默跳转。
- [x] 原始 HTML、危险 URL、图片和路径穿越不能突破阅读/API 安全边界。
- [x] 键盘、焦点、移动单列和 reduced-motion 行为符合规格手工清单。

## 范围外

- 文档目录搜索、历史、探路、交付和关系页。
- 应用内标签页、分屏阅读或本机编辑器/终端调用。

## 实施结果

- 唯一生产依赖 `markdown-it@15`（`dashboard/package.json`）。
- `src/server/markdown-render.js`：受限渲染（`html:false`、linkify 关闭、图片禁用为占位文本、危险协议 `javascript:` 等保持不可点击纯文本）；链接按正式关系映射应用安全规则——内部实体转为阅读链接、外部目标 `target="_blank" rel="noopener noreferrer"`、unresolved/unsafe 保留原始目标文本且 `aria-disabled` 不可导航；标题渲染带与索引一致的锚点 id。
- `src/project/entity-detail.js`：`entityDetailProjection`（元信息、受限正文 HTML、标题目录、一跳出向/入向关系含 kind/方向/解析状态/来源字段、相关诊断、快照状态）、`rawContentProjection`（完整原文含 frontmatter，text/plain）、`isValidEntityId`（拒绝绝对路径、盘符、`..` 段、反斜杠与残留 `%2f`/`%5c`/`..` 编码）。
- `src/dashboard.js`：新增 `GET /api/entities/:id` 与 `GET /api/entities/:id/raw`；非法 ID 400、不存在实体 404（保留目标 ID）、无正文实体 raw 404。
- `src/project/sources.js`：SourceDocument 增加 `raw` 字段保存完整原文。
- `src/project/relations.js`：resolved links-to 关系保留 `originalTarget`（正文链接映射所需）。
- `src/web/views/reader.js`：阅读视图——正文为主、标题目录（页内锚点）、"查看原始 Markdown"（同源新标签）、"复制路径"按钮（clipboard）、"信息 / 关系"检查器（默认收起：元信息、一跳关系列表、诊断、快照状态）、无正文实体显示结构化信息而非空白文档、无效/删除目标保留目标 ID 与返回入口、加载失败显示摘要回退。
- `src/web/app.js`：阅读页异步加载实体详情（404/失败诊断）、检查器焦点管理（打开时焦点进入面板、关闭与 Escape 返回触发控件、`aria-expanded`）、刷新保留检查器开关与滚动位置。
- `src/web/styles.css`：阅读正文排版（表、代码、引用、标题层级）、未解析链接删除线样式、检查器网格布局。

## 验证证据

- `npm test`：21 项全部通过，约 1.5 秒（新增 5 项：渲染安全、标题锚点、ID 校验、详情/原文投影、实体 API 集成含 400/404 与路径穿越）。
- 真实 CodeStable 项目冒烟：`/api/entities/ArchitectureIndex:.codestable/architecture/INDEX.md` 返回 kind/5 个标题/2241 字节受限 HTML/6 入向 5 出向关系；`/raw` 返回 200 text/plain 完整原文；不存在实体 404 保留 ID；双重编码穿越 404/400 拒绝。
- 测试命令：`cd dashboard && npm test`。
