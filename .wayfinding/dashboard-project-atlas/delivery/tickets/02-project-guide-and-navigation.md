---
交付类型: 功能
状态: 关闭
认领者: "01a00f46-db9f-7b8a-887d-b7fcd0e175b8"
硬依赖: [01-project-index-and-snapshot.md]
来源规格: ../spec.md
---

# 交付项目导读与可恢复导航壳

## 交付结果

用户首次打开 dashboard 时看到以项目理解为主的导读首页，并可通过固定导航进入 v2 资料面；页面以 URL 恢复共享状态，通过 SSE 局部更新而不整页 reload。

## 当前行为

页面是内嵌单页统计视图，导航和状态不能承载已确认的项目导读、URL 路由和 refresh 保留契约。

## 期望行为

原生 ESM 工作台提供概览、当前态、探路、交付、历史、文档和关系入口。概览按项目身份、权威阅读路径、当前项目地图、语义演变、当前注意力和继续入口组织；缺失来源与 stale 快照可见。

## 关键契约

- 首页不是统计大屏；当前行动只作为辅助信息。
- URL 至少承载 view、entity、query、filters 和 depth；刷新与浏览器历史不丢失共享状态。
- SSE 触发局部重取和重绘，不调用整页 reload。
- UI 使用编辑式极简语言，不使用渐变、玻璃拟态、重阴影、禁用字体或 emoji。

## 验收标准

- [x] 首页显示项目身份、权威阅读路径、当前项目地图、语义演变和当前注意力，且不把未配置来源显示为零进度。
- [x] 七个固定导航入口可到达对应视图状态，并具有可见焦点与语义名称。
- [x] URL、刷新和 Back/Forward 恢复当前视图及可共享状态。
- [x] SSE 更新不会整页 reload，并显示当前快照或 stale 状态。
- [x] 概览与导航在 Node 可测试投影中具有稳定输出。

## 范围外

- 实体正文阅读、搜索、历史详情、工作 DAG 和关系图。

## 实施结果

- `src/web/index.html`：页面壳（品牌 + 七个导航入口 + 快照状态区），外链 ESM 与样式表，无内联脚本。
- `src/web/styles.css`：编辑式极简视觉——暖色单色、轻边框、低饱和语义色、系统字体栈（无 Inter/Roboto/Open Sans）、移动端单列、`prefers-reduced-motion` 关闭动效、`:focus-visible` 可见焦点、无 emoji/渐变/阴影。
- `src/web/app.js`：History API 路由（`view`/`entity`/`query`/`filters`/`depth`，未知 view 回退 overview）、`pushState`+`popstate` 恢复共享状态、SSE `snapshot-changed`/`snapshot-stale`（含旧 `update` 兼容）触发局部重取与重绘并恢复滚动位置、stale/失败横幅、同源内链拦截。顶层无 DOM 访问，`parseUrl`/`buildUrl` 可在 Node 直接测试。
- `src/web/views/*.js`：八个视图纯函数（overview/state/wayfinding/delivery/history/documents/relations/reader 占位），输入投影输出转义 HTML，Node 可测。概览按"项目身份 → 权威阅读路径 → 当前项目地图 → 语义演变 → 当前注意力 → 继续入口"组织；未配置来源渲染"未配置/无资料"，不显示零进度。
- `src/server/static.js`：同源静态资源（`/assets/*` → `src/web/`），规范化后拒绝 `..` 逃逸、白名单扩展与 MIME、`nosniff`、同源 CSP、`no-referrer`；缺失资源 404。
- `src/dashboard.js`：路由改为 `/` 提供页面壳、`/assets/*` 静态资源；所有响应带 CSP/nosniff；删除被替代的内嵌 `pageHtml`。
- `src/project/projections.js`：快照投影扩展 `overview`（identity/readingPath/maps/evolution/attention/work/continue/hasWayfinding/hasDelivery/hasHistory）与 `entities` 摘要（含 category/path/state/owner/readiness/scope 等可定位字段）；`project.root` 输出 `.`，不再泄露 Windows 绝对路径。

## 验证证据

- `npm test`：16 项全部通过，约 1.4 秒（含视图纯函数稳定输出、URL 状态解析、HTTP/静态资源/路径穿越/CSP/nosniff、SSE 局部刷新与 stale 保留）。
- 真实 CodeStable 项目冒烟：`/` 200（8 个 `data-view` 导航、ESM 外链）、`/assets/app.js` 200、`/api/snapshot` 含 overview（readingPath = AttentionDocument > ArchitectureIndex > ArchitectureDocument×2 > RequirementIndex；work = 10 决策/9 工单，frontier 0、ready 1、blocked 7，与真实状态一致；continue 指向当前 ready 工单）；快照约 32 KB。
- 测试命令：`cd dashboard && npm test`。
