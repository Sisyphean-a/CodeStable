# Roadmap Goal 指令模板

`cs-epic` goal 阶段完成 roadmap 与全部 feature design 的内容确认、写完 goal 执行包并自查通过后，按本模板准备 fenced `/goal`。本指令连同 Goal acceptance、逐 feature scoped-commit 的范围在一次 Goal 启动 checkpoint 中展示；owner 确认后立即按 Goal driver 派发规则启动可见 Task agent，不再追加第二个授权门。不可见或失败时输出同一指令给用户粘贴。替换 `{slug}`，保留 `{feature-slug}` 运行时占位。

```text
/goal "执行 CodeStable roadmap 目录 .codestable/roadmap/{slug} 下的 goal 执行包。先读取 goal-protocol.md、goal-protocol-feature-loop.md、goal-protocol-gates.md、goal-protocol-audit.md、goal-state.yaml、goal-plan.md；这是已由用户确认 roadmap 和全部 feature design，并在同一次 Goal 启动确认中授权 Goal acceptance 与每个 feature 自动 scoped-commit 的模式，两项 ApprovalRef 仍须分别机械核验。按 goal-state.yaml 的 features 顺序循环：进入 cs-feat implementation、cs-code-review、cs-feat QA；review/QA 失败按协议修复重跑，awaiting/needs-human/blocked 分别等待、请求输入或 handoff。QA passed 后只用 goal-acceptance ApprovalRef 调用 ResumeGoalAcceptance；accept 后先持久化 accepted 状态与新 index，再机械核验 goal-commits ApprovalRef，只有有效时才 scoped-commit 本 feature 的全部状态更新，缺失、不匹配或 rejected 必须 handoff 且不得提交。每个 feature 完成打印 CS_ROADMAP_GOAL_FEATURE_DONE；全部完成后做最终 roadmap 审计。只有出现 CS_ROADMAP_GOAL_COMPLETE，且所有 feature review/QA/acceptance、授权提交和最终审计均通过、没有 CS_ROADMAP_GOAL_HANDOFF，本 goal 才算完成。"
```
