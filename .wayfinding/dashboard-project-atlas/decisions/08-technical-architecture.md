---
处理方式: 裁决
状态: 关闭
认领者: "01a00ecd-9d9b-781e-b87d-09545ad60a49"
硬依赖: [02-entity-relation-model.md, 04-reading-and-context-interaction.md, 05-temporal-and-graph-views.md, 06-document-discovery.md, 07-interface-prototype.md]
---

# 确定 dashboard v2 技术边界

## 问题

在保留本机只读、Node.js 20+、HTTP/SSE 自动刷新和最小依赖原则的前提下，dashboard v2 应如何划分扫描解析、实体索引、关系派生、API、客户端状态和视图模块，并选择怎样的依赖策略以支撑已确认体验？

## 答案

采用**模块化 Node.js 服务端 + 原生浏览器 ESM 客户端 + `markdown-it` 单一生产依赖**。保留 Node.js 20+、`cs web`、`127.0.0.1`、HTTP/SSE、只读和无构建步骤；不引入 React、Vue、Vite、Tailwind、图形库、状态库或客户端路由库。

### 模块边界

`bin/cs.js` 保持只做命令分发。`src/dashboard.js` 变成保留 `startDashboard`、`createSnapshot` 和命令解析导出的兼容入口，具体职责拆分为：

```text
src/project/
  root.js          项目根发现与仓库边界
  sources.js       受支持资料的安全枚举、读取与 SourceDocument 缓存
  markdown.js      frontmatter、标题、显式链接和 Markdown 渲染
  index.js         ProjectIndex 构建与稳定 ID
  relations.js     正式关系、反向关系与解析状态
  diagnostics.js   结构化诊断
  projections.js   概览、阅读、历史、探路、交付、文档和关系投影
src/server/
  app.js           HTTP 路由和响应
  refresh-store.js 指纹轮询、完整重建、原子替换与 SSE
  static.js        同源静态资源与路径安全
src/web/
  index.html       页面壳
  app.js           History API、URL 状态和刷新协调
  api.js           API 客户端
  views/           各页面投影的 DOM/SVG 渲染模块
  graph.js         有界、确定性的 DAG/关系图布局
  styles.css       编辑式极简视觉样式
```

资料只在 `ProjectIndex` 构建期解析一次；API 和页面只能读取索引或投影，不能各自重新解释项目文件。`graph.js` 使用原生 SVG；服务端只提供有依据的关系和有界局部图，不引入图形依赖。

### Markdown 与安全

添加唯一生产依赖 `markdown-it`，在服务端配置为 `html: false`、关闭自动 linkify 和图片渲染。原始 HTML 仅作为文本显示；Markdown 链接经自定义渲染规则区分仓库实体、外部、安全和未解析目标。外部链接用带 `noopener` 的新标签页；正文以已受限的 HTML 和原始 Markdown 两种只读表示提供。

服务端只按稳定实体 ID 查找原始资料，不接受客户端任意相对路径或绝对路径。静态资源和 API 均限制在项目根与同源路由内，拒绝路径穿越；响应设置明确 MIME、`nosniff` 与同源 CSP，脚本、样式和连接仅允许自身。Windows 绝对路径不得进入 API、URL 或 DOM。

### API、路由与客户端状态

```text
GET /api/snapshot       轻量概览投影、版本、快照状态和诊断摘要
GET /api/entities/:id   单实体正文、元信息、一跳关系和诊断
GET /api/entities/:id/raw  原始 Markdown（text/plain）
GET /api/search         已确认字段的结构化搜索与筛选
GET /api/relations      限深、限节点数的局部关系投影
GET /events             snapshot-changed / snapshot-stale SSE
```

保留 `/api/snapshot` 与公开函数作为兼容入口，但由 `ProjectIndex` 投影生成。客户端只用 History API 与原生 ESM；共享和刷新必须写入 URL 的状态包括 `view`、`entity`、`query`、`filters` 和 `depth`。检查器开关、折叠状态、滚动位置和加载状态留在内存。SSE 触发局部重新获取与重绘，不能整页重载，并必须尽可能保留当前选择、筛选、滚动和焦点。

### 刷新与缓存

启动时完整构建索引；轮询受支持资料根和 Git 元数据指纹。资料变化时后台完整重建新索引，只有无致命错误时才原子替换并广播 SSE。重建失败时保留最后成功快照，将快照状态标为 stale 并公开诊断；不伪造空集合或成功状态。首版不做持久化索引、文件监听器或复杂增量关系计算；只在内存中按路径和文件元数据复用未变化的 `SourceDocument`，规模与轮询阈值由质量决策限定。

## 依据

- 用户明确选择方案 A：接受 `markdown-it` 作为唯一生产依赖，采用无框架、模块化 Node/原生 ESM、无构建步骤的方案。
- 当前 `dashboard/package.json` 无声明第三方依赖，`src/dashboard.js` 集中扫描、快照、HTTP/SSE 和内嵌页面；当前 `npm test` 的 4 项基线测试均通过，拆分须保留公开入口和快照兼容投影。
- [定义项目实体与关系模型](02-entity-relation-model.md) 要求每个资料源只解析一次，所有页面从 `ProjectIndex` 派生，诊断和关系是一等数据。
- [确定阅读与上下文交互](04-reading-and-context-interaction.md) 要求实体 ID 深链接、正文优先、安全原文入口、URL 恢复和刷新后保持上下文。
- [区分时间线、依赖图与关系图](05-temporal-and-graph-views.md) 要求独立、有界且确定性的图，原生 SVG 足以实现首版 20 节点/40 边局部图。
- [确定文档发现与搜索边界](06-document-discovery.md) 限定首版只做索引字段的结构化搜索，因此无需全文搜索服务、向量数据库或客户端状态框架。
- 未采用手写 Markdown 解析器，以避免把 HTML 转义和链接安全变成无依据的自研安全边界；未采用 React/Vite 等框架和构建链，因为其复杂度不服务于本机只读、小规模项目阅读场景。
