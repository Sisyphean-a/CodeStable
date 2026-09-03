# CodeStable

## 上游项目（Fork 来源）

**本项目 Fork 自：[codestable/CodeStable](https://github.com/codestable/CodeStable)。**

CodeStable 是一组帮助 AI 与开发者快速理解项目当前行为、开发者意图和可追溯演进的人工智能编程技能。文档是理解的载体，但默认工作集只保留当前任务真正需要的内容；对项目的理解永远是第一追求。

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
- **手动调用**：只有用户明确输入 `/skill:技能名` 才会触发，适合跨会话检查点、删除、迁移和长期记忆等需要用户确认的动作。

如果希望一次任务稳定使用指定能力，直接显式调用：

```text
/skill:cs-goal 不讨论实现，帮我把这个模糊想法收敛成产品主线
/skill:cs-feat 增加一个用户可见的筛选功能
/skill:cs-issue 修复登录失败的问题
/skill:cs-refactor 在不改变行为的前提下拆分这个模块
/skill:cs-explain 讲清一次请求从入口到回包怎么走
/skill:cs-learn 带我学习这个请求全线路的实现
/skill:cs-checkpoint save checkout-flow
/skill:cs-checkpoint resume checkout-flow
/skill:cs-checkpoint done checkout-flow
```

不确定该选哪个时，调用 `/skill:cs`；一次任务只选择一个主技能。高风险改动会按需进入独立审查门禁。

## 技能一览

| 技能 | 调用方式 | 用途 |
| --- | --- | --- |
| `cs` | 手动 | 在多个技能之间分诊，选出一个主技能 |
| `cs-goal` | 自动 | 把模糊产品想法或现有整体偏离感收敛成产品主线，不讨论实现或 UI 方案 |
| `cs-feat` | 自动 | 实现明确能力与现行设计，或把目标型委托直接做成可观察结果 |
| `cs-issue` | 自动 | 诊断并修复违反既定契约的错误 |
| `cs-refactor` | 自动 | 在保持外部行为不变的前提下重构 |
| `cs-code-review` | 自动 | 对抗审查明确代码差异、分支或提交 |
| `cs-domain` | 自动 | 把已确认的术语、规则、架构边界、决定和每轮必读规则写入唯一权威当前态 |
| `cs-memory-guard` | 自动 | 发现确定的 `.codestable` 结构违规时，修复局部文档；语义冲突保留并报告 |
| `cs-onboard` | 手动 | 初始化项目记忆，或迁移整套旧 `.codestable` |
| `cs-explain` | 自动 | 解释当前项目的能力、接口、模块、调用流程与设计意图，并按需使用图、树、伪代码、diff 或 HTML |
| `cs-learn` | 自动 | 以当前项目的函数、流程、改造或技术为教材带读和练习 |
| `cs-docs` | 自动 | 编写面向用户或开发者的指南、教程、API 参考和独立流程文档 |
| `cs-docs-neat` | 手动 | 剪枝已有项目记忆，删除重复或陈旧材料 |
| `cs-checkpoint` | 手动 | 保存、恢复或删除大型任务的临时跨会话检查点 |
| `cs-audit` | 自动 | 只读扫描代码、安全、性能或架构风险 |
| `cs-ui-design` | 自动 | 创建新界面设计或明确重做现有界面；固定设计稿下的照稿实现交给 `cs-feat` |
| `grilling` | 自动 | 按设计树轮次压力测试计划、决定或想法 |
| `grill-with-docs` | 手动 | 按轮次追问，用临时台账保住上下文，并在整体确认后更新项目当前态 |
| `domain-modeling` | 自动 | 在讨论中澄清领域语言、规则与边界，产出已确认的模型增量 |

## 记忆原则

CodeStable 优先读取项目当前态；只有会影响未来判断的原因、约束和高代价决定才进入项目记忆，普通过程和通过结果留在 Git 或 CI 中。

面向开发者的流程文档是按用户需要维护的独立读者材料，不属于日常 AI 开发记录，也不进入默认工作集；AI 可以按问题读取，但其他技能不会随代码变化自动同步它。

多包仓库仍只保留一个根 `.codestable`。架构信息按包定位，领域语言按业务边界归档；只有没有更窄语义所有者、并约束所有相关领域上下文的概念才进入根领域上下文，跨包导入或消费不会把包内术语升级为全局术语。
