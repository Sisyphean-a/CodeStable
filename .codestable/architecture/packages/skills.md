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
- `old-skills/`：退出现行集合的归档，位于 `skills/` 外，不进入 `npx skills` 公开技能目录。
- `README.md`：`npx skills` 的安装和更新入口，以及完整技能目录。

## 职责地图

- 任务分诊与交付：`cs`、`cs-feat`、`cs-issue`、`cs-refactor`、`cs-code-review`、`cs-audit`。
- 项目理解与读者文档：`show-me`、`cs-learn`、`cs-docs`。
- 项目当前态：`cs-domain`、`cs-memory-guard`、`cs-onboard`、`cs-docs-neat`、`domain-modeling`。
- 临时任务续接：`cs-checkpoint`。
- 目标与方案澄清：`cs-goal`、`cs-ui-design`、`grilling`、`grill-with-docs`。

`cs`、`cs-onboard`、`cs-docs-neat`、`cs-checkpoint` 和 `grill-with-docs` 需要用户显式调用；其余技能可按请求自动选择。完整判定以各自的 `SKILL.md` frontmatter 为准。

## 关键依赖与边界

- 日常事实查询、局部修复和常规审查由当前 agent 直接执行；只有高风险最终差异在冻结后进入独立 Pi 会话或人工审查，技能包因此无需子代理插件或自动派发运行时。
- `cs-domain` 的项目记忆规则唯一由 `skills/cs-domain/references/memory-model.md` 定义；`cs-memory-guard`、`cs-onboard`、`cs-goal` 和 `grill-with-docs` 按需引用它。
- `cs-goal` 只把从零想法或现有整体偏离感收敛成已确认的产品主线，不产出解决方案、界面设计或代码；`cs-feat` 在用户要求直接交付时以内嵌 Goal Read 承接目标型委托，不自动串联 `cs-goal`，独立视觉方案仍由 `cs-ui-design` 拥有。
- `show-me` 拥有视觉优先的即时讲解，执行契约唯一由 `skills/show-me/SKILL.md` 定义；`cs-learn` 只在当前对话中用项目代码、测试和必要的一手资料带读并验证理解；`cs-docs` 仅在用户要求长期材料时按 `skills/cs-docs/references/flow-doc.md` 写独立读者流程文档。
- `cs-checkpoint` 在 `.tmp/checkpoints/` 为多个大型任务维护命名的当前快照；只有一个时自动选择，完成即删，不进入项目记忆或默认工作集。
- `grilling` 唯一定义设计树、轮次和前沿；调用它的技能只维护自身状态，不复制访谈算法。
- `cs-issue` 默认走轻量修复；故障风险或记录价值需要更强证据时，才披露诊断循环。`cs-code-review` 分开判断项目标准与需求符合度；`cs-feat` 只在低成本稳定测试面存在时使用红绿垂直切片。
- 模块边界发生变化时，`cs-feat`、`cs-refactor` 和 `cs-code-review` 按需使用 `skills/cs-refactor/references/module-depth.md`。

## 代码锚点

- `skills/cs/SKILL.md`
- `skills/cs-goal/SKILL.md`
- `skills/show-me/SKILL.md`
- `skills/cs-learn/SKILL.md`
- `skills/cs-docs/SKILL.md`
- `skills/cs-docs/references/flow-doc.md`
- `skills/cs-checkpoint/SKILL.md`
- `skills/cs-domain/SKILL.md`
- `skills/cs-memory-guard/SKILL.md`
- `skills/cs-domain/references/memory-model.md`
- `skills/cs-refactor/references/module-depth.md`
- `skills/cs-issue/SKILL.md`
- `skills/cs-code-review/SKILL.md`
- `skills/cs-feat/SKILL.md`
- `skills/grilling/SKILL.md`
- `skills/grill-with-docs/SKILL.md`
