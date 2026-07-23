---
name: cs-domain
description: "权威当前态。术语、稳定规则、架构边界或难回退决定需要成为项目唯一现行依据时使用。"
argument-hint: "<术语、规则、边界或决定>"
---

# 权威当前态

只维护“现在为何如此”，不保存讨论过程。

## 边界

- `.codestable/requirements/CONTEXT.md`：术语、稳定业务规则、跨模块不变量。
- `.codestable/architecture/INDEX.md`：workspace/package 拓扑与主题索引。
- `.codestable/architecture/shared/<topic>.md`：跨包共用契约和事实。
- `.codestable/architecture/packages/<package>.md`：包边界、差异、依赖与代码锚点。
- `.codestable/requirements/adrs/<id>-<slug>.md`：存在真实替代方案且回退代价高的决定。

## 步骤

1. **归类。** 为事实选择上面唯一一个权威区域；shared 事实不得复制到 package 页面。**完成条件：事实只有一个 owner 和 scope。**
2. **校准。** 读取相关代码与当前态；只有具体关键词、代码锚点或冲突需要解释原因时才检索少量 history/ADR。**完成条件：拟写结论与当前证据一致。**
3. **更新。** 用现在时编辑权威页面；替代旧规则时写明替代关系，ADR 用 `superseded-by`。**完成条件：读者能判断现在是什么以及必要时为何如此。**
4. **留痕。** 只有本次变化会影响未来判断时才追加当月 history。**完成条件：必要的当前结论能追到代码和历史/ADR 证据；否则明确无需 history。**
5. **查重。** 搜索所触 scope 的矛盾活跃结论和 shared 复制。**完成条件：没有未解决冲突或重复 owner。**

选定记忆类别后，只读[项目记忆模型](references/memory-model.md)中对应小节；不整份加载无关类别。

## 完成条件

事实有唯一当前 owner、明确 scope、有效代码锚点和必要的原因链；不创建过程文档。
