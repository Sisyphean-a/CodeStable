# 架构索引

## 范围地图

- `workspace`：CodeStable 将项目理解建立在当前代码、明确决定和可追溯演进上；对外入口是仓库根 [README](../../README.md)。
- `package:skills`：技能包，见[技能包](packages/skills.md)。全部可分发技能位于 `skills/*/SKILL.md`。
- `package:dashboard`：可选的本地只读仪表盘，见[仪表盘包](packages/dashboard.md)。

## 默认加载

修改任一技能时，先读 `attention.md`、本页、[技能包](packages/skills.md)和[领域上下文](../requirements/CONTEXT.md)，再读目标 `SKILL.md` 及它直接链接的 `references/` 文件。关于原因或替代关系，才检索 `history/`。

## 公开边界

- [README](../../README.md) 是用户安装、更新和选用技能，以及本地安装仪表盘的入口；技能仍通过 `npx skills` 安装。
- 每个 `skills/<name>/SKILL.md` 是该技能的可分发入口；同目录的 `references/` 只为该技能提供按需加载的细节。
- `dashboard/` 是独立 Node.js 包；`npm link` 注册本机 `cs` 命令，`cs web` 只在找到 `.codestable` 的项目中启动只读环回服务。
- `.tmp/` 只存可丢弃的工作状态，不参与分发。

## 代码锚点

- `README.md`
- `skills/*/SKILL.md`
- `dashboard/bin/cs.js`
- `dashboard/src/dashboard.js`
- `skills/cs-domain/references/memory-model.md`
