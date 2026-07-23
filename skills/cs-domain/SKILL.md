---
name: cs-domain
description: "Canonical project memory. Use when terminology, stable rules, architecture boundaries, or a hard-to-reverse decision must become the project's current source of truth."
argument-hint: "<term, rule, boundary, or decision>"
---

# Canonical project memory

Maintain what is true now, not a transcript of how the team arrived there.

## Boundary

Write only these current-state areas:

- `.codestable/requirements/CONTEXT.md`: terms, stable business rules, and cross-module invariants.
- `.codestable/architecture/INDEX.md`: workspace/package topology and topic index.
- `.codestable/architecture/shared/<topic>.md`: contracts and facts shared by packages.
- `.codestable/architecture/packages/<package>.md`: package boundaries, differences, dependencies, and code anchors.
- `.codestable/requirements/adrs/<id>-<slug>.md`: consequential decisions that are expensive to reverse and had real alternatives.

Task plans, ordinary implementation choices, test output, file lists, and review reports are not current-state memory.

## Steps

1. **Classify.** Identify the one canonical area above. A shared fact belongs in `shared/`, never copied into package pages. Complete when the fact has one owner and one scope.
2. **Reconcile.** Read the relevant code, current-state page, and only the history or ADR fragments needed to explain a conflict. Code plus confirmed decisions outrank stale prose. Complete when the proposed statement matches current evidence.
3. **Update.** Edit the canonical page in present tense. When replacing an old rule, state the replacement and update links; mark an ADR `superseded-by` instead of deleting it. Complete when readers can tell what is true now and why.
4. **Trace.** If this change itself affects future judgment, append one entry to the current month's history using the memory model. Complete when the current statement links to code and, where useful, its history or ADR evidence.
5. **Check.** Search the touched scope for contradictory live statements and copied shared facts. Complete when no unresolved conflict remains.

Before writing current state, read [the canonical memory model](references/memory-model.md). Read only the sections needed for the selected memory class.

## Completion

The fact has one current owner, explicit scope, current code anchors, and a traceable reason when the reason matters. No process document was created.
