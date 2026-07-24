---
name: cs-feedback
description: "证据保管链。用户显式要求记录或上报 CodeStable 自身问题时使用。"
disable-model-invocation: true
argument-hint: "<反馈> [会话] [发布]"
---

# 证据保管链

选定事件及其分诊结果是唯一反馈记录；预览和发布只是该记录的投影。证据默认私有，不修改目标技能或项目记忆。

## 步骤

1. **定域。** 获取用户反馈和一个会话：`current`、编号/路径或用户批准的近期搜索；存在多个会话或事件时只展示元数据并让用户选择。**完成条件：一个采集边界和触发记录已固定。**
2. **采集。** 在宿主临时目录调用 `collect_feedback_context.py`。把程序、脚本路径和每个参数名与参数值作为独立参数传给执行工具：`[python, script, --feedback, feedbackText, --session, session, --cwd, cwd, --output, outputPath]`；**不得**把用户原话拼进命令字符串，也不得把这组参数交给命令解释器再解析。近期搜索用 `--since-days N` 替代 `--session`，显式选定事件后加 `--incident <id>`。**完成条件：得到 `schema_version: 3`、`privacy: local-private` 的私有证据和分诊记录，或明确报告采集失败。**
3. **分诊。** 每次只问 `quality.next_questions` 第一项；用户补充的预期或实际行为必须引用当前事件的 `observation_ids`。重跑使用同一私有目录和固定截点，除非用户明确重选事件。**完成条件：主事件唯一，证据缺口可见，未知根因保持 `unclassified`。**
4. **预览。** 仅从 `public-issue-context.json` 构建事件类型、目标技能、预期行为、实际行为、影响、建议修法六字段预览。展示目标仓库、标题和完整正文；用户批准该精确版本后，用参数数组重跑采集器，并传 `--approve-public-preview`、`--target-repo`、`--issue-body-output` 与 `--approval-output`。任何重跑都会撤销旧批准。**完成条件：一次性批准绑定目标仓库、当前投影哈希和随机批准编号，内容不含会话原文、本地/相对代码路径、代码文件名、仓库身份、环境值、凭据、原始工具数据或代码块。**
5. **单次发布。** 只有本轮针对预览的明确批准才可调用发布器；仍使用参数数组 `[python, script, --repo, repo, --title, approvedTitle, --body-file, bodyPath, --public-context, contextPath, --approval-file, approvalPath, --confirm-public-preview]`。发布器核验目标仓库并在创建前原子消费批准；`gh issue create` 只执行一次，网络结果模糊时先人工检查 GitHub。**完成条件：得到地址、明确的手动结果、失败结果或未知结果；实际创建尝试前批准已消费，且未上传私有文件。**

## 完成条件

私有采集边界和分诊质量明确；公开内容只来自允许字段且逐次批准；无后台采集、项目过程产物、兼容投影、回归夹具或自动修改目标技能。
