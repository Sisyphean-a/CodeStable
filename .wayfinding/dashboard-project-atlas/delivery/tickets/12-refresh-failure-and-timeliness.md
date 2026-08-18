---
交付类型: 缺陷
状态: 关闭
认领者: "01a013ea-4786-70f7-ae44-96100d28613c"
硬依赖: []
来源规格: ../spec.md
---

# 修复刷新失败呈现与快照时效

## 交付结果

轮询指纹失败和有效资料变更都以可观察、可验证的快照状态处理：失败公开 stale/诊断/SSE，成功在时限内重建快照并通知客户端。

## 当前行为

`dashboard/src/server/refresh-store.js` 在指纹读取异常时仅写 `console.error` 并重试，保持原有快照状态。主工作区 `npm test` 中，受跟踪资料变更后的快照刷新用例在 900ms 等待后失败。

## 期望行为

满足 AC-09 与 AC-10；保持最后成功索引的原子替换模型和 `snapshot-changed` / `snapshot-stale` SSE 契约。

## 关键契约

- [纠偏规格 AC-09 与 AC-10](../spec.md)
- [资料与显式关系契约](../../decisions/01-artifact-contracts.md)
- [技术边界](../../decisions/08-technical-architecture.md)
- [质量与验证契约](../../decisions/09-quality-contracts.md)

## 验收标准

- [x] AC-09
- [x] AC-10

## 范围外

- 不替换轮询为文件监听器，不引入持久化索引或复杂增量刷新。
- 不改变本机只读、环回监听或现有兼容 API 边界。

## 实施结果

修复指纹轮询失败只写终端日志、快照仍显示 fresh 的违例，并补齐刷新失败的可观察呈现：

- `src/server/refresh-store.js`：抽取 `markStale(error)`，指纹读取/权限/路径异常与重建失败走同一 stale 通道——保留最后成功索引，`state` 标记 `stale` 并携带 `staleSince`、`lastError`，广播 `snapshot-stale`；新增可注入 `fingerprintReader` 测试接缝（默认仍为模块内 `projectFingerprint`）。指纹实现职责未回流到 `dashboard.js`。
- `src/dashboard.js`：`startDashboard` 透传 `fingerprintReader` 注入选项（仅测试接缝，不影响公开边界）。
- `src/project/projections.js`：快照状态为 stale 时向 `diagnostics.items` 追加可定位的 `stale-snapshot` 诊断（severity error、source `refresh-store`、location `.`、消息含 `lastError`），页面无需另行解释文件即可呈现失败。
- `test/dashboard.test.js`：新增 `exposes fingerprint polling failures as stale diagnostics and SSE`——注入指纹读取失败，断言 SSE 收到携带错误的 `snapshot-stale`、`/api/snapshot` 为 `stale`、`lastError` 可定位、最后成功索引保留、诊断项包含 `stale-snapshot`；新增 `readEvent` 超时辅助。

成功路径未改动：指纹变化→完整重建→原子替换→`snapshot-changed` 的时序与 3 秒门槛保持，AC-10 由既有 SSE 时限用例继续覆盖。

## 验证证据
| AC | 证据 | 当前观察 |
| --- | --- | --- |
| AC-09 | `cd dashboard && node --test test/dashboard.test.js test/scale.test.js` 中 `exposes fingerprint polling failures as stale diagnostics and SSE` | 通过：SSE 收到 `snapshot-stale`（含模拟错误），`/api/snapshot` 为 `stale`，`lastError` 含 `.codestable/history`，历史条目保留为 1，`diagnostics.items` 含 `stale-snapshot` 且 `location.path === "."` |
| AC-10 | 同一命令中 `refreshes the served snapshot after a tracked project file changes` 与 `change to SSE notification stays under 3 seconds` | 通过：受跟踪 Markdown 变更后 `/api/snapshot` 重建投影（entries 1→2）；规模 fixture 变更到 SSE `snapshot-changed` 实测约 1.1s（门槛 3s） |

完整回归：`cd dashboard && npm test` 54/54 通过（原记录 49/51）。

## 独立审查

**第一轮审查**（审查 agent 1，新上下文）：AC-09 通过——指纹异常与重建异常共用 `markStale`，`console.error` 已删除，`staleSince` 语义优于旧实现（首败取 `Date.now()`、连败保留首值），SSE `snapshot-stale` payload 含 staleSince/lastError 且保留 `update` 兼容，诊断追加不污染 `index.diagnostics`、可定位；AC-10 通过——成功链路未被改动，既有刷新用例与 3 秒 SSE 用例仍在。契约与质量无阻塞项。总门禁：可关闭。指出证据声明需更正（全量偶发 52/54：`refreshes the served snapshot` 900ms 固定等待在全量负载下 flaky、`hot index projections` 属 AC-11 负载抖动）及三项次要建议（waitFor 化、定时器清理、诊断码常量）。

**第二轮复核**（审查 agent 2，新上下文）：waitFor 改动通过——有 deadline、超时显式失败不吞错、1→2 断言完整，聚焦 3 轮全绿；readEvent 清理通过——executor 同步赋值、`clearTimeout(timer)` 无 undefined，败者定时器已清；常量替换通过——`DiagnosticCodes.StaleSnapshot === "stale-snapshot"`、无循环依赖；staleSince 断言真实有效。总门禁：可关闭。已知残余（非本工单引入）：指纹瞬时恢复后需指纹变化才回到 fresh。
