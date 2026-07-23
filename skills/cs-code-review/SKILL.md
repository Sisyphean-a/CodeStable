---
name: cs-code-review
description: "Adversarial code review. Use when the user explicitly requests review of a diff, or when a security, data, production, irreversible-effect, or core-protocol change requires independent review."
argument-hint: "<diff, branch, commit, or paths>"
---

# Adversarial code review

Review the final change as a read-only critic. Do not implement fixes in the same review run.

## Steps

1. **Bound.** Identify the exact diff and intended behavior. Read the changed code plus the minimum current-state memory and call paths needed to judge it. Complete when every changed file is in or explicitly out of scope.
2. **Attack.** Look for correctness failures, regressions, security and data risks, contract mismatches, performance costs, and missing meaningful tests. Trace effects beyond changed lines where calls or data cross boundaries. Complete when every change and affected contract has been considered.
3. **Verify.** Reproduce candidate findings with code evidence or a focused non-mutating check. Discard style preferences and speculation that do not affect behavior, maintainability, safety, performance, testability, or requirements. Complete when each finding has a trigger and impact.
4. **Report.** Lead with findings ordered by severity, each with a precise location and concrete consequence. Then state open assumptions, test gaps, and residual risk. If there are no findings, say so directly. Complete when the author can act without reconstructing the review.

For a qualifying high-risk change, read [the high-risk branch](references/high-risk.md) and verify its authorization, recovery, risk-specific checks, and independence requirements.

## Completion

The entire stated diff and its affected contracts were reviewed, every finding is evidenced and prioritized, test gaps are explicit, and no review report was added to project memory unless a conclusion independently crossed the memory threshold.
