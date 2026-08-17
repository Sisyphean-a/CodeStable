# CodeStable

## 上游项目（Fork 来源）

**本项目 Fork 自：[codestable/CodeStable](https://github.com/codestable/CodeStable)。**

CodeStable 是一组以项目当前态和可追溯演进为核心的人工智能编程技能。对项目的理解永远是第一追求

## 安装

运行交互式安装：

```sh
npx skills@latest add Sisyphean-a/CodeStable
```

安装器会让你选择需要的技能、目标 Agent 和安装范围。全局安装是否可用取决于所选 Agent。

安装全部技能，同时继续交互选择目标 Agent：

```sh
npx skills@latest add Sisyphean-a/CodeStable --skill "*"
```

## 更新

项目级安装：

```sh
npx skills@latest update -p
npx skills@latest add Sisyphean-a/CodeStable --skill "*"
```

全局安装：

```sh
npx skills@latest update -g
npx skills@latest add Sisyphean-a/CodeStable --skill "*" -g
```

更新命令不要添加 `-y`；发现上游已删除的技能时，按提示确认删除。第二条命令会补齐仓库新增的技能，并继续交互选择目标 Agent。

## 项目面板

本仓库内的 `dashboard/` 提供可选的本地只读面板，需要 Node.js 20 或更高版本。克隆仓库后执行一次：

```sh
cd dashboard
npm link
```

`npm link` 会把当前检出的 `dashboard/` 作为本机链接安装，因此源码更新后不需要重新安装。进入任何带 `.codestable/` 的项目目录后运行：

```sh
cs web
```

命令会打开 `http://127.0.0.1:43173`，并在 `.codestable/`、`.wayfinding/`、`.delivery/` 或 Git 状态变化时自动刷新页面。`cs web --no-open` 不自动打开浏览器，`cs web --port 4400` 可指定端口；找不到 `.codestable/` 时命令退出，不展示面板。

## 怎么用

安装后，技能有两种调用方式：

- **自动调用**：Agent 会根据用户请求和技能描述自行判断是否使用，不需要手动输入 `/skill:`。这是“允许自动触发”，不是每次都保证触发。
- **手动调用**：只有用户明确输入 `/skill:技能名` 才会触发，适合删除、迁移、长期记忆和自主推进等需要用户确认的动作。

如果希望一次任务稳定走指定流程，直接显式调用：

```text
/skill:cs-feat 增加一个用户可见的筛选功能
/skill:cs-issue 修复登录失败的问题
/skill:cs-refactor 在不改变行为的前提下拆分这个模块
/skill:cs-wayfinder 为这个跨会话的大型目标建立决策地图
/skill:cs-to-spec 把这张已完成地图折叠成实施规格
/skill:cs-to-tickets 把这份规格拆成实施工单
/skill:cs-implement 从这个交付面领取并完成下一张工单
```

大型目标的显式交接是 `cs-wayfinder` → `cs-to-spec` → `cs-to-tickets` → `cs-implement`；每次调用仍只产生一个阶段结果，不会在后台自动串联。

不确定该选哪个时，调用 `/skill:cs`；一次任务只选择一个主技能。高风险改动会按需进入独立审查门禁。

## 技能一览

| 技能 | 调用方式 | 用途 |
| --- | --- | --- |
| `cs` | 手动 | 在多个技能之间分诊，选出一个主技能 |
| `cs-feat` | 自动 | 实现新能力或有意改变行为 |
| `cs-issue` | 自动 | 诊断并修复违反既定契约的错误 |
| `cs-refactor` | 自动 | 在保持外部行为不变的前提下重构 |
| `cs-code-review` | 自动 | 分开审查项目标准与需求符合度 |
| `cs-domain` | 自动 | 把已确认的术语、规则、架构边界、决定和每轮必读规则写入唯一权威当前态 |
| `cs-onboard` | 手动 | 初始化项目记忆，或迁移整套旧 `.codestable` |
| `cs-docs` | 自动 | 编写面向用户或开发者的指南、教程和 API 文档 |
| `cs-docs-neat` | 手动 | 剪枝已有项目记忆，删除重复或陈旧材料 |
| `cs-audit` | 自动 | 只读扫描代码、安全、性能或架构风险 |
| `cs-brainstorm` | 自动 | 围绕一个单项选择探索并收敛实质不同的产品或技术方向 |
| `cs-wayfinder` | 手动 | 为多个相互依赖的未知建立或推进跨会话决策地图 |
| `cs-to-spec` | 手动 | 把已确认对话、地图或需求折叠成一份实施规格 |
| `cs-to-tickets` | 手动 | 把规格拆成带硬依赖的可交付垂直工单 |
| `cs-implement` | 手动 | 领取并完成交付面中的下一张实施前沿工单 |
| `grilling` | 自动 | 按设计树轮次压力测试计划、决定或想法 |
| `grill-with-docs` | 手动 | 按轮次追问，用临时台账保住上下文，并在整体确认后更新项目当前态 |
| `domain-modeling` | 自动 | 在讨论中澄清领域语言、规则与边界，产出已确认的模型增量 |

## 记忆原则

CodeStable 优先读取项目当前态；只有会影响未来判断的原因、约束和高代价决定才进入项目记忆，普通过程和通过结果留在 Git 或 CI 中。

多包仓库仍只保留一个根 `.codestable`。架构信息按包定位，领域语言按业务边界归档；只有没有更窄语义所有者、并约束所有相关领域上下文的概念才进入根领域上下文，跨包导入或消费不会把包内术语升级为全局术语。
