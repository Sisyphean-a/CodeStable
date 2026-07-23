---
name: cs-refactor
description: "Behavior-preserving refactor. Use when structure, readability, maintainability, or performance should improve without changing the intended external contract."
argument-hint: "<target and invariant>"
---

# Behavior-preserving refactor

Improve the implementation while keeping its observable contract stable.

## Boundary

State the behavior to preserve before editing: outputs, errors, ordering, timing or freshness promises, accessibility, and public interfaces as applicable. An intentional contract change is a feature; correcting a violated contract is an issue.

## Steps

1. **Characterize.** Load scoped current state and identify the target, invariant, and evidence that captures current behavior. Add the smallest characterization check when existing coverage cannot prove equivalence. Complete when a regression would be observable.
2. **Refactor.** Change the implementation in coherent, reviewable increments. Complete when the structural or measured objective is achieved without a second live path or compatibility layer.
3. **Verify.** Run behavior-equivalence checks and affected regressions; for performance work, compare a representative benchmark and include resource costs. Complete when fresh evidence proves the preserved contract and the claimed improvement.
4. **Remember.** Apply [the canonical memory threshold](../cs-domain/references/memory-model.md). Mechanical cleanup normally leaves no project document; update architecture when a real module boundary or stable dependency relation changes.

If the work touches security, persisted data, production operations, irreversible external effects, or a core cross-package protocol, read [the high-risk branch](../cs-code-review/references/high-risk.md) before the risky action.

## Completion

The objective is measurable, behavior remains equivalent, verification passes, and memory reflects any enduring boundary change. No process artifact or automatic review was added.
