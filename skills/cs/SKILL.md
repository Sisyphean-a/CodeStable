---
name: cs
description: "Index and triage the CodeStable skill set. Invoke explicitly when you need help choosing one primary skill."
disable-model-invocation: true
argument-hint: "<request or question>"
---

# Triage

Choose one primary skill. A run does not chain primary skills or disguise later work as another workflow.

## Index

| Intent | Skill |
|---|---|
| Initialize or migrate project memory | `cs-onboard` |
| Add capability or intentionally change behavior | `cs-feat` |
| Diagnose and fix wrong behavior | `cs-issue` |
| Improve structure while preserving behavior | `cs-refactor` |
| Decompose a large capability and its dependencies | `cs-epic` |
| Pursue an explicit terminal goal autonomously | `cs-goal` |
| Write user or developer documentation | `cs-docs` |
| Scan a scope and report findings without fixes | `cs-audit` |
| Review a concrete diff | `cs-code-review` |
| Explore and converge a fuzzy idea | `cs-brainstorm` |
| Update canonical terms, rules, architecture, or ADRs | `cs-domain` |
| Add one per-session startup rule | `cs-note` |
| Preserve a cross-project lesson | `cs-keep` |
| Prune stale project memory | `cs-docs-neat` |
| Collect and report a CodeStable skill failure | `cs-feedback` |

## Steps

1. Identify the request's desired result, not incidental words such as “plan”, “review”, or “continue”. Complete when one row owns the main result.
2. If two rows remain plausible, ask one question that separates their external outcomes. Complete when one primary skill remains.
3. Name that skill and give one sentence explaining the boundary. For user-invoked skills, tell the user the exact skill name to invoke; do not pretend to auto-load it. Complete when the next action is unambiguous.

## Completion

Return one recommendation, one discriminating question, or this compact index. Do not write project files or start the selected workflow in the triage run.
