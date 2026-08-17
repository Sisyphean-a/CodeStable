---
scope: package:dashboard
code-paths:
  - dashboard
---

# 仪表盘包

本包提供本地只读 Web 仪表盘。`npm link` 将 `dashboard/bin/cs.js` 注册为本机 `cs` 命令；在任意 CodeStable 项目目录执行 `cs web` 后，它向上查找最近的 `.codestable`，在 `127.0.0.1` 启动服务并打开浏览器。

## 公开边界

- `cs web [--port <port>] [--no-open]`：启动一次本地仪表盘；没有 `.codestable` 时以错误退出。
- 服务只监听 `127.0.0.1`，不提供远程访问、认证或写入端点。
- 页面读取 `.codestable/`、可选的 `.wayfinding/` 和 `.delivery/`、Git 状态及仓库内 `skills/`；轮询这些输入并通过 Server-Sent Events 刷新浏览器。

## 职责与边界

- `bin/cs.js` 只分发命令并报告用户输入错误。
- `src/dashboard.js` 拥有项目发现、Markdown frontmatter 派生状态、快照、HTTP/SSE 和浏览器启动。
- 仪表盘只展示派生结果，不认领或关闭决策项、工单，也不写入 `.codestable`、规划面或 Git。

## 已确认的 v2 演进目标

当前实现仍以上述单文件为准；以下是已经确认、将在完整 v2.0 中替换该实现的架构边界，不能误读为已落地代码：

- Dashboard 继续是 Node.js 20+ 的本机只读环回服务，保留 `cs web`、`127.0.0.1`、HTTP/SSE 和无写入端点；不引入远程访问、认证、编辑或项目管理能力。
- 每次扫描只构建一个有类型的只读 `ProjectIndex`；资料源只解析一次，页面与 API 只能从索引投影读取实体、显式关系和诊断，不能各自重新解释项目文件。
- 服务端按模块拆分资料读取/解析、索引、关系、诊断、投影、HTTP、刷新和静态资源；客户端使用原生 ESM、History API 和原生 SVG，不引入前端框架、构建链或图形/状态库。唯一生产依赖为受限配置的 `markdown-it`。
- 刷新以完整新索引的原子替换为准；重建失败保留最后成功快照并公开 `stale` 诊断，页面局部重取数据且尽可能保持 URL、选择、筛选、阅读位置和焦点。
- v2.0 只在项目导读、阅读、文档发现、历史、探路、交付和关系探索组成完整理解闭环后发布。实施依次经过可信阅读核心、发现与演变、当前工作、关系与发布硬化四个切片；中间切片不是公开 v2。
- 质量门禁以 Node 契约、HTTP/SSE、安全、性能和页面投影测试为强制条件；Chrome/Edge 的键盘、移动、刷新和视觉规范使用留有记录的手工发布清单。首版不引入浏览器自动化。

完整依据与逐项验收条件见 [dashboard 项目全景工作台决策地图](../../../.wayfinding/dashboard-project-atlas/map.md)。

## 代码锚点

- `dashboard/package.json`
- `dashboard/bin/cs.js`
- `dashboard/src/dashboard.js`
- `dashboard/test/dashboard.test.js`
