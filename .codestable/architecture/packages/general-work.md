---
scope: package:general-work
code-paths:
  - general-work
---

# 通用工作包

这是独立于编程技能的纯文档能力包，产品主线与语言由[通用工作上下文](../../requirements/contexts/general-work.md)拥有。它面向另一台电脑的单用户办公工作区，不依赖原 `cs-*`、仪表盘、数据库或后台服务。

## 分发边界

- `general-work/skills/<name>/SKILL.md`：五个入口 `work`、`check`、`grill-me`、`memory`、`record`。
- `skills/memory/references/context-model.md`：整套能力的唯一运行上下文协议，其他技能通过相对链接消费，不复制协议。
- `skills/work/references/`：文件纪律与 Word/PPT/Excel 参考，检查技能复用格式依据。
- `workspace/AGENTS.md`、`workspace/.assistant/INDEX.md`：复制到办公根后生效的入口模板，不包含真实画像。
- [使用说明](../../../general-work/README.md)：整套复制、宿主加载与能力验证入口；原编程技能的安装路径不改变。

五技能须整套配置并保留同级目录关系，默认目标为办公根 `.agents/skills/`；不能单装入口后遗失共享参考。工作区指令中的相对路径从办公根解析，技能引用从对应技能目录解析。

## 运行与验证

实际文件操作由目标宿主与工具提供，源码不携带 Office 引擎、不配置 MCP、不后台监听聊天。用户运行记忆、访谈快照与原稿副本属于目标工作区，不是本包资产，也不进入本仓库项目记忆。

`general-work/test/skills.test.mjs` 使用 Node 内置测试验证声明、共享引用及模板复制后的可达性；Node 是维护工具，不是使用依赖。静态加载不证明模型服从、文件可恢复或目标工具可重算与渲染，真实能力要在获准样本上验证。

仪表盘仍按既有资料契约读取；本包不扩张其技能分类、状态控制或功能，不为展示新目录修改仪表盘。

## 代码锚点

- `general-work/skills/work/SKILL.md`
- `general-work/skills/grill-me/SKILL.md`
- `general-work/skills/memory/references/context-model.md`
- `general-work/workspace/AGENTS.md`
- `general-work/test/skills.test.mjs`
