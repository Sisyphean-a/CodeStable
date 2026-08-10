---
scope: package:skills
code-paths:
  - skills
---

# 技能包

本包把每项能力作为一个独立的 `SKILL.md` 分发。根 `README.md` 负责面向用户的安装和使用说明；技能目录不依赖仓库内的构建、插件或服务运行时。

## 公开边界

- `skills/<name>/SKILL.md`：技能的名称、调用方式、适用场景和完成条件。
- `skills/<name>/references/`：仅在对应技能要求时读取的补充规则；它们不构成独立技能。
- `README.md`：`npx skills` 的安装和更新入口，以及完整技能目录。

## 职责地图

- 任务分诊与交付：`cs`、`cs-feat`、`cs-issue`、`cs-refactor`、`cs-code-review`、`cs-audit`、`cs-docs`。
- 项目当前态：`cs-domain`、`cs-onboard`、`cs-docs-neat`、`domain-modeling`。
- 方案与长期不确定性：`cs-brainstorm`、`cs-wayfinder`、`grilling`、`grill-with-docs`。

`cs`、`cs-onboard`、`cs-docs-neat`、`cs-wayfinder` 和 `grill-with-docs` 需要用户显式调用；其余技能可按请求自动选择。完整判定以各自的 `SKILL.md` frontmatter 为准。

## 关键依赖与边界

- `cs-domain` 的项目记忆规则唯一由 `skills/cs-domain/references/memory-model.md` 定义；`cs-onboard`、`grill-with-docs` 和 `cs-wayfinder` 按需引用它。
- 模块边界发生变化时，`cs-feat`、`cs-refactor` 和 `cs-code-review` 按需使用 `skills/cs-refactor/references/module-depth.md`。
- 单个可在当前会话收敛的选择由 `cs-brainstorm` 处理；跨会话、多个相互依赖未知由 `cs-wayfinder` 建图推进。规范定义见[领域上下文](../../requirements/CONTEXT.md)。

## 代码锚点

- `skills/cs/SKILL.md`
- `skills/cs-domain/SKILL.md`
- `skills/cs-domain/references/memory-model.md`
- `skills/cs-refactor/references/module-depth.md`
- `skills/cs-wayfinder/SKILL.md`
- `skills/cs-brainstorm/SKILL.md`
- `skills/grill-with-docs/SKILL.md`
