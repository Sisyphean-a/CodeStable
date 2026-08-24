---
scope: workspace
---

# 领域上下文

CodeStable 为 AI 编程工作提供可安装的技能和可选的本地只读仪表盘，以帮助 AI 与开发者快速理解项目当前行为和开发者意图为首要目标；文档是理解的载体，当前代码、明确决定和可追溯演进共同提供依据。

## 作用域

- `package:skills`：技能包，见[技能包](../architecture/packages/skills.md)。
- `package:dashboard`：本地只读仪表盘，见[仪表盘包](../architecture/packages/dashboard.md)。
- 当前没有独立的 `context:` 或 `shared:` 领域上下文；出现由特定语义边界拥有的事实后再建立。

## 通用语言

**技能**：一个可独立分发的 AI 工作能力；入口是 `skills/<name>/SKILL.md`，其中声明适用场景和调用方式。

**项目理解**：AI 与开发者无需阅读每行实现，也能定位项目能力、关键流程、数据和分支去向，并区分当前行为、已确认的开发者意图和推测。

**读者流程文档**：用户选择长期阅读的 Mermaid 优先流程说明；它独立于项目当前态、工作状态和历史，不属于日常 AI 开发记录，也不进入默认工作集。

**项目当前态**：当前代码与已确认决定共同构成的现行事实。`.codestable/architecture/` 和 `requirements/` 只存这类事实；它们与当前代码冲突时，以代码和明确决定为准。

**工作状态**：尚未整体确认的讨论、探索证据或依赖。它保存在 Pi 会话、既有规划面，或被忽略的 `.tmp/` 快照中，不进入项目当前态。

## 稳定规则

- 用户通过 `README.md` 中的 `npx skills` 安装或更新技能；可选仪表盘在仓库的 `dashboard/` 中通过 `npm link` 本机链接安装，`cs web` 不是技能安装的替代路径。
- 仪表盘只监听 `127.0.0.1`，只读取项目当前态、规划面和 Git 派生状态；它不能成为认领、关闭或写入项目记忆的旁路。
- 技能设计以项目理解为首要整合标准：帮助 AI 或开发者恢复当前行为与意图，或在交付单一结果时保持其可理解性。
- 技能文本信任高能力模型，以目标、最佳纪律、必要边界和可检查完成标准为核心；只有真实交接或风险契约需要时才编排固定阶段。
- 每个技能只拥有一个外部结果或一套可复用纪律；技能之间只通过用户明确提供的现有产物交接，不在一次调用中自动串联多个阶段。
- `cs-checkpoint` 仅按用户调用在 `.tmp/checkpoints/<task-name>.md` 保存多个大型任务各自的当前快照；恢复时核对工作区，完成时删除，不进入项目记忆或默认工作集。
- `cs-learn` 只在当前对话中以项目代码和测试为教材，通过带读与理解验证教授函数、全线路实现和必要技术知识，不建立课程或学习记录。
- `cs-explain` 只即时讲解当前项目，不写文件；读者流程文档只有用户明确要求时才由 `cs-docs` 创建或更新，写作与维护规则以[流程文档](../../skills/cs-docs/references/flow-doc.md)为准，其他技能不自动同步。
- 项目记忆的价值门槛、规范格式、唯一归属和检索标准以[项目记忆模型](../../skills/cs-domain/references/memory-model.md)为唯一依据。
- 确认后的事实必须只有一个当前权威位置；历史和 Pi 会话只说明原因与证据，不能覆盖当前态。
- 访谈或探索中的局部结论先留在工作状态；依赖闭合并经整体确认后，才作为一个变化单元交给 `cs-domain` 归档。

## 代码锚点

- `README.md`
- `dashboard/src/dashboard.js`
- `skills/cs-domain/references/memory-model.md`
- `skills/cs-explain/SKILL.md`
- `skills/cs-learn/SKILL.md`
- `skills/cs-docs/references/flow-doc.md`
- `skills/cs-checkpoint/SKILL.md`
- `skills/grilling/SKILL.md`
- `skills/grill-with-docs/SKILL.md`
