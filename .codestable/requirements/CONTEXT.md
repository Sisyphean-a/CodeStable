---
scope: workspace
---

# 领域上下文

CodeStable 为 AI 编程工作提供可安装的技能，并把项目理解建立在当前代码、明确决定和可追溯演进之上。

## 作用域

- `package:skills`：唯一实现包，见[技能包](../architecture/packages/skills.md)。
- 当前没有独立的 `context:` 或 `shared:` 领域上下文；出现由特定语义边界拥有的事实后再建立。

## 通用语言

**技能**：一个可独立分发的 AI 工作能力；入口是 `skills/<name>/SKILL.md`，其中声明适用场景和调用方式。

**项目当前态**：当前代码与已确认决定共同构成的现行事实。`.codestable/architecture/` 和 `requirements/` 只存这类事实；它们与当前代码冲突时，以代码和明确决定为准。

**工作状态**：尚未整体确认的讨论、探索证据或依赖。它保存在 Pi 会话、既有规划面，或被忽略的 `.tmp/` 快照中，不进入项目当前态。

## 稳定规则

- 用户通过 `README.md` 中的 `npx skills` 安装或更新技能；仓库不提供插件、服务或本地运行时作为替代安装方式。
- 确认后的事实必须只有一个当前权威位置；历史和 Pi 会话只说明原因与证据，不能覆盖当前态。
- `cs-brainstorm` 只收敛一个当前会话内的选择；多个相互依赖、需要跨会话推进的未知交给 `cs-wayfinder`。前者发现问题网时升级，后者遇到尚未形成选项空间的单项选择时交接。
- 访谈或探索中的局部结论先留在工作状态；依赖闭合并经整体确认后，才作为一个变化单元交给 `cs-domain` 归档。

## 代码锚点

- `README.md`
- `skills/cs-domain/references/memory-model.md`
- `skills/cs-brainstorm/SKILL.md`
- `skills/cs-wayfinder/SKILL.md`
- `skills/grill-with-docs/SKILL.md`
