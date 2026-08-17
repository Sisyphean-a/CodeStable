---
scope: package:skills
code-paths:
  - skills
---

# 技能包

本包把每项能力作为一个独立的 `SKILL.md` 分发；技能责任边界遵循[领域上下文](../../requirements/CONTEXT.md)。根 `README.md` 负责面向用户的安装和使用说明；技能目录不依赖仓库内的构建、插件或服务运行时。

## 公开边界

- `skills/<name>/SKILL.md`：技能的名称、调用方式、适用场景和完成条件。
- `skills/<name>/references/`：仅在对应技能要求时读取的补充规则；它们不构成独立技能。
- `README.md`：`npx skills` 的安装和更新入口，以及完整技能目录。

## 职责地图

- 任务分诊与交付：`cs`、`cs-feat`、`cs-issue`、`cs-refactor`、`cs-to-spec`、`cs-to-tickets`、`cs-implement`、`cs-code-review`、`cs-audit`、`cs-docs`。
- 项目当前态：`cs-domain`、`cs-onboard`、`cs-docs-neat`、`domain-modeling`。
- 方案与长期不确定性：`cs-brainstorm`、`cs-wayfinder`、`grilling`、`grill-with-docs`。

`cs`、`cs-onboard`、`cs-docs-neat`、`cs-wayfinder`、`cs-to-spec`、`cs-to-tickets`、`cs-implement` 和 `grill-with-docs` 需要用户显式调用；其余技能可按请求自动选择。完整判定以各自的 `SKILL.md` frontmatter 为准。

## 关键依赖与边界

- `cs-domain` 的项目记忆规则唯一由 `skills/cs-domain/references/memory-model.md` 定义；`cs-onboard`、`grill-with-docs` 和 `cs-wayfinder` 按需引用它。
- `grilling` 唯一定义设计树、轮次和前沿；调用它的技能只维护自身状态，不复制访谈算法。
- `cs-wayfinder` 只解决决策网络；完成地图由用户显式交给 `cs-to-spec` 折叠规格，再由 `cs-to-tickets` 生成带硬依赖的示踪弹工单。`cs-implement` 每次认领一张实施前沿，并按工单类型复用 `cs-feat`、`cs-issue` 或 `cs-refactor` 的交付纪律。
- 本地交付面的规格、工单格式和前沿规则唯一由 `skills/cs-to-tickets/references/delivery-surface.md` 定义；中间工单只更新交付面，全部工单关闭后才按完整规格合并裁决项目记忆。
- `cs-issue` 默认走轻量修复；故障风险或记录价值需要更强证据时，才披露诊断循环。`cs-code-review` 分开判断项目标准与需求符合度；`cs-feat` 只在低成本稳定测试面存在时使用红绿垂直切片。
- 模块边界发生变化时，`cs-feat`、`cs-refactor` 和 `cs-code-review` 按需使用 `skills/cs-refactor/references/module-depth.md`。
- 单个可在当前会话收敛的选择由 `cs-brainstorm` 处理；跨会话、多个相互依赖未知由 `cs-wayfinder` 建图推进。规范定义见[领域上下文](../../requirements/CONTEXT.md)。

## 代码锚点

- `skills/cs/SKILL.md`
- `skills/cs-domain/SKILL.md`
- `skills/cs-domain/references/memory-model.md`
- `skills/cs-refactor/references/module-depth.md`
- `skills/cs-issue/SKILL.md`
- `skills/cs-code-review/SKILL.md`
- `skills/cs-feat/SKILL.md`
- `skills/cs-wayfinder/SKILL.md`
- `skills/cs-brainstorm/SKILL.md`
- `skills/cs-to-spec/SKILL.md`
- `skills/cs-to-tickets/SKILL.md`
- `skills/cs-to-tickets/references/delivery-surface.md`
- `skills/cs-implement/SKILL.md`
- `skills/grilling/SKILL.md`
- `skills/grill-with-docs/SKILL.md`
