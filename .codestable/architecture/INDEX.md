# 架构索引

## 范围地图

- `workspace`：CodeStable 将项目理解建立在当前代码、明确决定和可追溯演进上；对外入口是仓库根 [README](../../README.md)。
- `package:skills`：原编程技能包，见[技能包](packages/skills.md)，入口位于 `skills/*/SKILL.md`。
- `package:general-work`：独立通用工作技能与办公工作区模板，见[通用工作包](packages/general-work.md)，代码位置为 `general-work/`。
- `package:dashboard`：可选的本地只读仪表盘，见[仪表盘包](packages/dashboard.md)。

## 默认加载

修改任一技能时，先读 `attention.md`、本页、改动路径对应的包页面（[编程技能](packages/skills.md)或[通用工作](packages/general-work.md)）和[领域上下文](../requirements/CONTEXT.md)的相关作用域，再读目标 `SKILL.md` 及它直接链接的参考。关于原因或替代关系，才检索 `history/`。

## 公开边界

- [README](../../README.md) 是分发入口；原编程技能仍通过 `npx skills` 安装，通用工作按[独立使用说明](../../general-work/README.md)整套配置到办公工作区。
- 每个 `skills/<name>/SKILL.md` 是编程技能的可分发入口；通用工作入口位于 `general-work/skills/<name>/SKILL.md`，共享依赖由其包页面说明。
- `dashboard/` 是独立 Node.js 包；`npm link` 注册本机 `cs` 命令，`cs web` 只在找到 `.codestable` 的项目中启动只读环回服务。
- `.tmp/` 只存可丢弃的工作状态，不参与分发。

## 代码锚点

- `README.md`
- `skills/*/SKILL.md`
- `general-work/skills/*/SKILL.md`
- `general-work/workspace/AGENTS.md`
- `dashboard/bin/cs.js`
- `dashboard/src/dashboard.js`
- `dashboard/src/project/index.js`
- `dashboard/src/server/refresh-store.js`
- `dashboard/src/web/app.js`
- `skills/cs-domain/references/memory-model.md`
