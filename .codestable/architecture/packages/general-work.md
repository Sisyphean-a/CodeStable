---
scope: package:general-work
code-paths:
  - general-work
---

# 通用工作包

这是独立于编程技能的纯文档能力包，产品主线与语言由[通用工作上下文](../../requirements/contexts/general-work.md)拥有。它面向单用户、多项目的日常工作，不依赖原 `cs-*`、仪表盘、数据库或后台服务。

## 分发边界

- `general-work/skills/<name>/SKILL.md`：六个入口 `work`、`check`、`grill-me`、`memory`、`record`，以及显式调用的知识库初始化入口 `setup`。
- `skills/memory/references/context-model.md`：知识位置、作用域与读写的唯一运行协议；所有入口通过相对链接消费，普通工作也在执行前读取相关上下文。
- `skills/work/references/`：文件纪律与 Word/PPT/Excel 参考，检查技能复用格式依据。
- [使用说明](../../../general-work/README.md)：安装与使用入口，原编程技能的安装来源不改变。

可分发运行资产只有技能及必要参考，不再携带外置工作区模板。六个技能按正常宿主机制安装并保留同级关系，位置由宿主决定；`setup` 现场生成知识数据，不复制技能或修改宿主配置。共享引用从对应技能目录解析，数据引用从协议确定的用户知识根解析。

## 运行与验证

用户知识根与当前仓库、技能安装位置无关；项目知识通过索引映射和稳定作用域标识区分，不逐仓库建立知识库。全局统一存放不使项目规则自动成为通用规则；初始化独立于日常读取和维护，旧知识迁移只处理明确授权来源。

实际文件操作由目标宿主与工具提供，源码不携带 Office 引擎、不配置 MCP、不后台监听聊天。用户记录、访谈快照与原稿副本属于本机私有数据，不是本包资产，也不进入本仓库项目记忆。宿主旧入口与新协议冲突时先显式解决，不暗中覆盖用户配置。

`general-work/test/skills.test.mjs` 使用 Node 内置测试验证声明、共享入口及仅安装技能后的参考闭包；演练只在仓库临时目录，不初始化开发者真实用户知识。静态检查不证明模型服从、实际迁移幂等、文件可恢复或 Office 可重算与渲染，真实能力要在获准目标环境验证。

仪表盘仍按既有资料契约读取；本包不扩张其技能分类、状态控制或功能，不为展示新目录修改仪表盘。

## 代码锚点

- `general-work/skills/work/SKILL.md`
- `general-work/skills/grill-me/SKILL.md`
- `general-work/skills/setup/SKILL.md`
- `general-work/skills/memory/references/context-model.md`
- `general-work/test/skills.test.mjs`
