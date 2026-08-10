# 架构索引

## 范围地图

- `workspace`：CodeStable 是一套以项目当前态和可追溯演进为中心的 AI 编程技能；对外入口是仓库根 [README](../../README.md)。
- `package:skills`：唯一实现包，见[技能包](packages/skills.md)。全部可分发技能位于 `skills/*/SKILL.md`。
- 没有跨包共享机制，也没有需要单独建页的共享架构事实。

## 默认加载

修改任一技能时，先读 `attention.md`、本页、[技能包](packages/skills.md)和[领域上下文](../requirements/CONTEXT.md)，再读目标 `SKILL.md` 及它直接链接的 `references/` 文件。关于原因或替代关系，才检索 `history/`。

## 公开边界

- [README](../../README.md) 是用户安装、更新和选用技能的入口；安装使用 `npx skills`。
- 每个 `skills/<name>/SKILL.md` 是该技能的可分发入口；同目录的 `references/` 只为该技能提供按需加载的细节。
- 仓库没有插件、服务或本地运行时；`.tmp/` 只存可丢弃的工作状态，不参与分发。

## 代码锚点

- `README.md`
- `skills/*/SKILL.md`
- `skills/cs-domain/references/memory-model.md`
