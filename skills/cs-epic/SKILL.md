---
name: cs-epic
description: "Capability decomposition. Use when a large or system-level outcome must be split into independently verifiable deliverables with explicit dependencies, or when that dependency map must be updated."
argument-hint: "<large outcome>"
---

# Capability decomposition

Maintain the shape of a large outcome. Do not implement child work or run reviews from this skill.

## Steps

1. **Anchor.** Load the relevant scoped current state and state the overall outcome, non-goals, constraints, and evidence that will prove it complete. Complete when the boundary is testable rather than a theme.
2. **Decompose.** Split by independently valuable or independently verifiable outcomes, not by files, teams, or workflow stages. Complete when every child has a result, scope, and completion evidence and no child merely says “review” or “integrate everything”.
3. **Order.** Record hard dependencies and explain why each is hard. Replace coordination preferences with parallelism where contracts allow it. Complete when the dependency graph is acyclic and every root can start from current facts.
4. **Persist minimally.** Update one active epic page under `.codestable/architecture/` only when the decomposition itself is durable current architecture work; otherwise keep it in the user's existing planning surface. Link rather than copy shared contracts. Complete when there is one owner for the live map.
5. **Refresh.** When facts change, update outcomes and edges, remove completed planning detail, and append history only if the changed reason will affect future judgment. Complete when the map describes what remains, not a transcript of execution.

Use [the canonical memory model](../cs-domain/references/memory-model.md) for any `.codestable` write.

## Completion

The overall outcome and non-goals are explicit, every child is independently verifiable, the dependency graph is sound, and no child implementation, batch design, review, or goal driver was started.
