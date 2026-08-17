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

## 代码锚点

- `dashboard/package.json`
- `dashboard/bin/cs.js`
- `dashboard/src/dashboard.js`
- `dashboard/test/dashboard.test.js`
