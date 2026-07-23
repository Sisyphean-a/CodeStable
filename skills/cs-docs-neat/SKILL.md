---
name: cs-docs-neat
description: "Prune CodeStable project memory after a phase or migration. Invoke explicitly to retain, distill, supersede, or delete stale process documents within a named scope."
disable-model-invocation: true
argument-hint: "<workspace or package scope>"
---

# Prune project memory

The result is a smaller, more accurate default working set.

## Steps

1. **Scope.** Derive `workspace` or `package:<name>` from changed paths or the user's target. Read only its attention, current-state pages, direct shared dependencies, and active legacy units. Complete when unrelated packages are excluded.
2. **Judge.** For every candidate document choose exactly one action: retain current truth; distill reusable truth into its canonical page; supersede stale truth with a pointer to the replacement; delete absorbed process material. Complete when every candidate has a decision.
3. **Execute.** Write valid conclusions to current state or history before deleting their source. Preserve code anchors, date, and Git or original evidence. ADRs are superseded, never silently removed. Complete when no unique evidence was lost.
4. **Reconcile.** Compare retained current-state claims with code and confirmed decisions. Restore current truth when old prose merely describes earlier behavior; ask only when authoritative evidence genuinely conflicts. Complete when live pages do not contradict code.
5. **Prune.** Remove completed plans, routine verification, file inventories, duplicate reports, absorbed exploration, and empty process directories. Do not create an audit, migration, or cleanup artifact. Complete when the scoped default set is shorter, or no change is made because no sediment exists.
6. **Verify.** Check links, duplicate shared facts, stale replacement pointers, and scope leakage. Complete when every retained fact is reachable from the current index and traceable to evidence.

When a write or history decision is needed, use [the canonical memory model](../cs-domain/references/memory-model.md).

## Completion

Every scoped candidate was handled, current state agrees with code, reusable evidence remains traceable, and cleanup did not add a process document.
