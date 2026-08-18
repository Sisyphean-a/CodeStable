---
交付类型: 缺陷
状态: 关闭
认领者: "01a013a9-8ca2-72a8-95a7-933abfbb8b05"
硬依赖: []
来源规格: ../spec.md
---

# 交付可访问的移动导航抽屉

## 交付结果

390px 视口下的全局导航以可访问抽屉操作，不再只在顶栏换行；键盘和焦点行为完整。

## 当前行为

`dashboard/src/web/index.html` 始终渲染完整导航，`dashboard/src/web/styles.css` 在移动断点只让顶栏换行，没有抽屉触发控件、展开状态或焦点管理。

## 期望行为

满足 AC-08：键盘可打开/关闭抽屉，打开后焦点进入抽屉，关闭后返回触发控件。

## 关键契约

- [纠偏规格 AC-08](../spec.md)
- [首次打开的信息架构](../../decisions/03-first-open-information-architecture.md)
- [阅读与上下文交互](../../decisions/04-reading-and-context-interaction.md)
- [质量与验证契约](../../decisions/09-quality-contracts.md)

## 验收标准

- [x] AC-08

## 范围外

- 不改变固定导航的七个页面入口、桌面导航布局或路由模型。
- 不引入前端框架、组件库或浏览器自动化依赖。

## 实施结果

- `index.html` 增加原生 `nav-toggle` 按钮，保留七个既有页面入口和路由。
- `styles.css` 在 720px 以下将导航收进右侧抽屉；桌面规则保持原样，抽屉只对位移做动效并遵守 `prefers-reduced-motion`。
- `app.js` 增加抽屉开关状态、`aria-expanded`/可访问名称、Enter/Space 开启、Escape 关闭、Tab/Shift+Tab 边界循环、打开后首个入口焦点和关闭后触发按钮回焦；点击入口后关闭抽屉。
- 增加静态壳断言和无浏览器依赖的 DOM/状态单测。

## 验证证据
| AC | 证据 | 当前观察 |
| --- | --- | --- |
| AC-08 | 自动化：工作目录 `dashboard`，`node --test test/views.test.js test/dashboard.test.js`（11/11）；`node --check src/web/app.js test/views.test.js test/dashboard.test.js`；`git diff --check`。覆盖 DOM 按钮契约、Enter/Space、打开后首项焦点、Tab/Shift+Tab 环回、Escape 回焦、导航入口关闭回焦。 | 静态页面包含 `nav-toggle`、`aria-expanded=false`、`aria-controls=nav`，七个链接保留；运行时状态和焦点断言通过。 |
| AC-08 | 人工：执行人 Codex（Pi 会话 `01a013a9-8ca2-72a8-95a7-933abfbb8b05`）；日期 `2026-08-18`；浏览器 `HeadlessChrome/151.0.0.0`（browser-harness `0.1.5`）；资料样本为共享工作区 `E:/github/CodeStable` 的当前 `.codestable` 与 dashboard，入口 `http://127.0.0.1:43211/?view=overview`；视口 `1280x900`、`390x844`。在 1280px 七个导航入口保持桌面布局；在 390px 初始仅显示“导航”按钮且无横向遮挡，鼠标和键盘 Enter 打开抽屉，首个“概览”入口取得可见焦点，Tab 进入“当前态”，Escape 关闭并把可见焦点返回“导航”按钮；点击“当前态”入口后抽屉关闭并进入当前态页面。 | 浏览器观察与 AC-08 的移动结构、键盘开启/关闭、焦点进出一致。 |

完整回归：`cd dashboard && npm test` 最终 53/53 通过；此前一次运行曾出现 `test/scale.test.js` 的 `hot index projections stay under 200 ms`（`search 263ms`），后续完整重跑已通过，未发现与本工单导航代码相关的持续失败。

## 独立审查

- 审查者：独立 `cs-code-review` agent，会话 `01a013e0-d431-7baf-959b-16ac9d074ca4`。
- 结论：标准轴无阻塞发现；需求轴确认 AC-08 的移动抽屉、ARIA、键盘开关、焦点进入/回焦、桌面回归和人工证据均直接命中。
- 逐项门禁：AC-08：通过。
- 总门禁：通过；允许关闭工单。
- 残余风险：真实七入口、390px 布局和 reduced-motion 仍主要依赖人工清单，未来 DOM/CSS 变更可能引入浏览器语义回归；本工单范围不引入浏览器自动化。
