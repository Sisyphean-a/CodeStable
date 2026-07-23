---
name: cs-issue
description: "Root-cause repair. Use when existing behavior is wrong, an error must be diagnosed, or a regression must be fixed."
argument-hint: "<symptom or failure>"
---

# Root-cause repair

Restore the intended contract and leave evidence that distinguishes the cause from the symptom.

## Boundary

A new desired capability is a feature. A structure-only change with preserved observable behavior is a refactor. Reclassify before editing when the requested contract, rather than the implementation, is what changed.

## Steps

1. **Reproduce.** Load the relevant scoped current state, then reproduce the symptom or establish an equivalent failing observation. Retrieve a history fragment only when a concrete keyword, code anchor, or conflict requires its reason. Complete when the failure, expected contract, and evidence gap are explicit.
2. **Prove.** Trace the failure to a cause that explains all observed symptoms. Complete when changing that cause predicts the reproduction will pass; if reproduction is impossible, report the missing evidence instead of claiming a diagnosis.
3. **Repair.** Fix the cause and add or adjust the narrowest durable regression check. Complete when the original reproduction passes and the symptom is not merely masked.
4. **Verify.** Run affected regression and contract checks. Complete when fresh evidence covers the repair's blast radius and no known required path remains failing.
5. **Remember.** Apply [the canonical memory threshold](../cs-domain/references/memory-model.md). Preserve only causes, unusual reproduction conditions, changed assumptions, and residual risks that can affect future judgment.

If diagnosis or repair touches security, persisted data, production operations, irreversible external effects, or a core cross-package protocol, read [the high-risk branch](../cs-code-review/references/high-risk.md) before the risky action.

## Completion

The root cause is evidenced, the intended behavior is restored, regression checks pass, and any future-relevant cause or changed constraint is represented in current memory. No report/analysis/fix-note pipeline or routine review artifact was created.
