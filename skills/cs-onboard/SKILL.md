---
name: cs-onboard
description: "Scaffold project memory, or migrate an existing `.codestable` collection to the current-state architecture, requirements, and history model."
argument-hint: "[scaffold|migrate] [scope]"
---

# Scaffold project memory

Create one small project memory that future agents can load by scope.

## Target

```text
.codestable/
├── attention.md
├── architecture/
│   ├── INDEX.md
│   ├── shared/
│   └── packages/
├── requirements/
│   ├── CONTEXT.md
│   └── adrs/
└── history/
```

A monorepo uses this single root and labels facts `scope: workspace` or `scope: package:<name>`.

## Steps

1. **Inspect.** Find repository roots, workspaces/packages, public boundaries, existing project guidance, and any `.codestable` content. Complete when the topology and whether this is scaffold or migration are known.
2. **Scaffold.** Create the target directories. Write a concise `attention.md`, an architecture index with code anchors and package ownership, and a `requirements/CONTEXT.md` containing only verified terms, stable rules, and invariants. Create package/shared pages only when evidence exists. Complete when a new session can identify the relevant scope without scanning the repository.
3. **Migrate when needed.** If legacy task directories or old context files exist, read [the migration branch](references/migration.md) and process one topic at a time. Complete when each migrated fact has a current owner or remains intentionally queued with its source intact.
4. **Check retrieval.** For one workspace task and each represented package, follow the scoped loading order in [the canonical memory model](../cs-domain/references/memory-model.md). Complete when current design, reason, and superseded history can be found without loading unrelated packages or traversing task directories.
5. **Prune.** Remove generated runtime rules, gates, templates, and legacy directories only after their unique evidence is represented or preserved in Git. Complete when there is no old/new workflow pair.

## Completion

The target tree is the only default memory entry, current pages match code, shared facts have one owner, old evidence is traceable, and no process workflow was installed into the project.
