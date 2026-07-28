# 领域上下文格式

领域上下文按语义作用域拆分，目录结构为：

```text
.codestable/requirements/
├── CONTEXT.md
├── shared/
│   └── <scope>.md
├── contexts/
│   └── <context>.md
└── adrs/
```

按需创建文件和目录。`CONTEXT.md` 是作用域地图，也是 `workspace` 事实的唯一位置；`shared/` 与 `contexts/` 只在对应事实首次出现时创建。领域上下文是业务语言边界，可映射到一个或多个代码包。

## 根上下文

```md
---
scope: workspace
---

# 领域上下文

一句话说明工作区解决的领域问题。

## 作用域

- [shared:commerce](shared/commerce.md)：Ordering、Billing 共同拥有的交易语言。
- [context:billing](contexts/billing.md)：开票与收款语言。代码位置：`packages/billing-core`、`apps/billing-api`。

## 通用语言

**{规范词}**：{没有更窄语义所有者、对整个工作区成立的定义。}
_避免_：{易混同义词}

## 稳定规则

- {约束所有相关领域上下文的规则。}
```

根文件只接收项目记忆模型判定为 `workspace` 的事实。代码路径与链接只是作用域地图，不会把被链接内容提升为工作区事实。

## 共享与领域上下文

```md
---
scope: context:billing
code-paths:
  - packages/billing-core
  - apps/billing-api
---

# Billing 领域上下文

一句话说明这个作用域拥有的业务能力。

## 通用语言

**账单**：Billing 请求客户付款的业务凭证。
_避免_：订单、支付

## 稳定规则

- 一张账单只使用一种结算币种。
```

共享文件把 frontmatter 改为 `scope: shared:<name>`，并增加：

```yaml
applies-to:
  - context:ordering
  - context:billing
```

## 写作规则

- 定义回答“它是什么”，保持一两句话；行为约束写入“稳定规则”。
- 选择一个规范词，把易混同义词放在 `_避免_`；一般编程术语不进入领域上下文。
- 文件按概念簇增加小节，保持当前态，不保存讨论过程。
- 一个事实只定义一次。包消费另一个作用域的概念时链接权威条目。
- `code-paths` 只记录领域上下文到实现位置的映射；依赖和实现机制不写入领域定义。
