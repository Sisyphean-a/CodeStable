---
交付类型: 缺陷
状态: 打开
认领者: ""
硬依赖: []
来源规格: ../spec.md
---

# 恢复热搜索性能门槛

## 交付结果

既定规模 fixture 上的热索引结构化搜索恢复到 200ms 中位时限以内，不降低 fixture 规模、搜索字段或筛选语义。

## 当前行为

主工作区 `npm test` 报告 `search 230ms`，超过热索引搜索的 200ms 契约。

## 期望行为

满足 AC-11，同时保留 `ProjectIndex` 作为唯一投影来源和既定结构化搜索语义。

## 关键契约

- [纠偏规格 AC-11](../spec.md)
- [文档发现与搜索边界](../../decisions/06-document-discovery.md)
- [技术边界](../../decisions/08-technical-architecture.md)
- [质量与验证契约](../../decisions/09-quality-contracts.md)

## 验收标准

- [ ] AC-11

## 范围外

- 不缩小规模 fixture，不放宽 200ms 中位阈值，不跳过异常样本。
- 不引入全文、模糊、语义/AI 搜索、持久化搜索库或新的生产依赖。

## 实施结果
<!-- 描述实际改动；未关闭时可记录候选结果 -->

## 验证证据
| AC | 证据 | 当前观察 |
| --- | --- | --- |
| AC-11 | `cd dashboard && node --test test/scale.test.js --test-name-pattern="hot index projections"`，记录固定次数的搜索中位值并断言不超过 200ms | 本轮 `npm test` 报告 `search 230ms` |

## 独立审查
<!-- 记录审查者稳定会话标识、逐项结论和总门禁结论 -->
