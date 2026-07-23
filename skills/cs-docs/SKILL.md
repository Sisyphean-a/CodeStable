---
name: cs-docs
description: "Reader-focused documentation. Use when the user asks to create or update a developer guide, user guide, tutorial, or API reference."
argument-hint: "<audience and topic>"
---

# Reader-focused documentation

Write the document the named reader needs. Project current-state memory is maintained separately.

## Steps

1. **Reader.** Fix the audience, task, prior knowledge, source of truth, and publishing location. Complete when the document has one reader outcome and a clear boundary.
2. **Verify facts.** Read the current implementation, public contracts, and neighboring documentation. Resolve contradictions against code and confirmed decisions. Complete when every behavior to be documented has an authoritative source.
3. **Write.** Match the existing information architecture and vocabulary. Put prerequisites before actions, make examples runnable, and link to canonical detail instead of copying it. Complete when the reader can perform the target task without process commentary.
4. **Validate.** Run examples where feasible; check commands, symbols, links, headings, and generated documentation rules. Complete when stale names and unverifiable claims are removed.

For an API reference, additionally enumerate every in-scope public endpoint or symbol, request/input shape, output and errors, authentication or side effects, and one valid example. Complete when the reference matches the current public surface exhaustively.

## Completion

The named reader outcome is covered, facts and examples are verified, links resolve, and no design, manifest, focused-edit, or docs-cleanup workflow artifact was created.
