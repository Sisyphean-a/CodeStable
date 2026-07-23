# Canonical memory model

This file is the single source of truth for how CodeStable project memory is loaded and written.

## Authority

Resolve disagreements in this order:

1. Current code and explicitly confirmed decisions.
2. Current-state pages in `architecture/`, `requirements/CONTEXT.md`, and active ADRs.
3. `history/` entries and superseded ADRs.
4. Old task, review, audit, exploration, and migration documents.

A reasonable code evolution is not a bug merely because old prose describes the previous behavior. Restore the current-state page and mark or remove stale material.

## Scoped loading

Determine scope from the paths being changed: `workspace` or `package:<name>`. At task start read:

1. `.codestable/attention.md`.
2. `.codestable/architecture/INDEX.md`.
3. The relevant package page and directly required shared pages.
4. Relevant sections of `requirements/CONTEXT.md`.

Retrieve ADRs, history, or old evidence only by a concrete keyword, code anchor, or conflict. Never load every package or every history file by default. A monorepo has one root `.codestable`.

## Current-state pages

Write in present tense and keep these pages compact:

- `architecture/INDEX.md`: scope map, topic links, and package ownership.
- `architecture/shared/<topic>.md`: one cross-package contract, invariant, or shared mechanism per topic.
- `architecture/packages/<package>.md`: the package's purpose, public boundaries, dependencies, differences from shared rules, and code anchors.
- `requirements/CONTEXT.md`: ubiquitous language, stable business rules, and cross-module invariants.
- `requirements/adrs/`: decisions with genuine alternatives and high reversal cost.

Do not duplicate a shared rule in package pages. Link to it and record only package-specific impact.

## Memory threshold

Ask: **Would a future agent make a wrong decision without knowing why this changed?**

- **No:** write no `.codestable` document. Formatting, mechanical rename, generated churn, and ordinary style changes normally end here.
- **Yes:** append a history entry.
- **Interface, module boundary, business rule, or prior assumption changed:** append history and update the owning current-state page.
- **Security, data, irreversible operation, cross-package protocol, or costly tradeoff:** do the above and add or supersede an ADR.

Accessibility, brand, compatibility, and other durable constraints make an apparently visual change non-mechanical.

## History

Append to `.codestable/history/YYYY-MM.md`; do not create a task directory or report.

```md
- YYYY-MM-DD · [feature|bug|refactor|evolution] One-sentence result. scope: workspace|package:<name>
  Reason: Why this changed now.
  Current basis: Updated architecture / CONTEXT / ADR link, or none.
  Evidence: Commit, code path, or original historical link.
```

Record only unusual failures, reproduction conditions, residual risks, or facts useful to future judgment. CI, Git, and source code retain routine commands, passing output, file lists, and review mechanics.

## ADRs

An ADR states context, decision, meaningful alternatives, consequences, scope, code anchors, and related history. Give it `status: accepted` or `status: superseded` and use `superseded-by` for replacement. Never silently delete an ADR.
