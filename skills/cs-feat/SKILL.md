---
name: cs-feat
description: "Feature implementation. Use when the user wants new externally observable capability or an intentional behavior change."
argument-hint: "<observable outcome>"
---

# Feature

Deliver the requested observable outcome without creating a parallel planning workflow.

## Boundary

This skill owns intentional behavior change. A request whose desired behavior is unchanged is a refactor; behavior that contradicts the intended contract is an issue. Reclassify before editing when evidence changes that boundary.

## Steps

1. **Scope.** Derive `workspace` or `package:<name>` from the paths likely to change. Load attention and only the relevant current-state memory, then inspect the code. Complete when the existing contract, desired outcome, and affected boundary are explicit.
2. **Implement.** Make the smallest coherent change that fully delivers the outcome. Let existing repository conventions govern design unless the feature changes them. Complete when every requested behavior is present in the real path, including relevant error and empty states.
3. **Verify.** Run focused checks that exercise the observable result and affected contracts. Expand to integration or regression coverage when the change crosses boundaries. Complete when fresh evidence proves the result and no known required path is untested.
4. **Remember.** Apply the memory threshold in [the canonical memory model](../cs-domain/references/memory-model.md). Complete when history, current state, and ADR have each been updated exactly when their threshold is met, or explicitly judged unnecessary.

If the change touches security, persisted data, production operations, irreversible external effects, or a core cross-package protocol, read [the high-risk branch](../cs-code-review/references/high-risk.md) before the risky action.

## Completion

The observable outcome works, necessary verification passes, high-risk obligations are settled, and current project memory does not contradict the implementation. No feature plan, checklist, QA report, acceptance report, or routine review artifact was created.
