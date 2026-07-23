---
name: cs-goal
description: "Bounded pursuit. Invoke explicitly with a terminal objective, acceptance evidence, and optional budget."
disable-model-invocation: true
argument-hint: "<objective, acceptance evidence, and optional budget>"
---

# Bounded pursuit

A goal is a terminal condition, not a wrapper around feature, issue, refactor, or review workflows. Use the best engineering action directly and keep one primary skill active.

## Steps

1. **Bind.** Translate the objective into a finite set of observable requirements, required artifacts or external state, and optional budget. Inspect authoritative current state before trusting prior summaries. Complete when “done” can be disproved.
2. **Restore.** On every continuation, compare each requirement with current files, command output, runtime behavior, external state, and any stated budget. Choose the highest-value unmet requirement. Complete when the next attempt is tied to one visible gap and remaining budget.
3. **Execute.** Make the change or investigation needed for that gap, then gather fresh evidence. Continue within the same goal; ordinary bugs, refactors, reviews, and test failures are work, not handoffs. Complete when the gap closes or yields a concrete blocker.
4. **Remember selectively.** Apply [the canonical memory threshold](../cs-domain/references/memory-model.md) to the work itself. Keep transient progress in the goal harness, not project documents. Complete when no progress or acceptance report was added as memory.
5. **Audit completion.** Recheck every original requirement against authoritative evidence and ensure no known required work remains. Complete only when all requirements pass together.

Before any security, data, production, irreversible-effect, or core-protocol action, load [the high-risk branch](../cs-code-review/references/high-risk.md) and satisfy its authorization, recovery, verification, and independent-review requirements.

Stop when the stated budget is exhausted and report unmet requirements with evidence. Stop as blocked only when the same external blocker has prevented progress in three consecutive goal turns and the exact user or external action required is known. Persist only the harness's minimal resume state.

## Completion

Fresh evidence proves every terminal requirement and no required work remains; otherwise the exhausted budget or qualifying repeated external blocker is recorded with unmet requirements and a precise recovery action. Any high-risk obligations are settled before completion.
