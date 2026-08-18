---
交付类型: 缺陷
状态: 打开
认领者: ""
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

- [ ] AC-09
- [ ] AC-10

## 范围外

- 不替换轮询为文件监听器，不引入持久化索引或复杂增量刷新。
- 不改变本机只读、环回监听或现有兼容 API 边界。

## 实施结果
<!-- 描述实际改动；未关闭时可记录候选结果 -->

## 验证证据
| AC | 证据 | 当前观察 |
| --- | --- | --- |
| AC-09 | 注入或 fixture 化指纹读取失败，断言 `/api/snapshot` 为 `stale`、诊断可定位且 SSE 收到 `snapshot-stale`；`cd dashboard && node --test test/dashboard.test.js test/scale.test.js` | 异常仅写终端日志 |
| AC-10 | 对有效 Markdown 变更轮询 `/api/snapshot` 与 `/events`，断言重建投影及 `snapshot-changed` 均在 3 秒内；执行同一命令 | 当前受跟踪变更测试失败 |

## 独立审查
<!-- 记录审查者稳定会话标识、逐项结论和总门禁结论 -->
