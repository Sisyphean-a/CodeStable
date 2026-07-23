# Legacy memory migration

Load this file only when `.codestable` already contains task, review, audit, exploration, compound, roadmap, or generated runtime material.

1. Pick one topic and one `workspace` or `package:<name>` scope.
2. Establish its current code truth and owning architecture, CONTEXT, or ADR page.
3. Extract only reasons, constraints, decisions, unusual failures, and residual risks that could affect future judgment.
4. Add a compact history entry with the old path or Git revision as evidence.
5. Mark stale material with its replacement while migration is incomplete.
6. Verify keyword and code-anchor retrieval reaches the current page.
7. Delete absorbed process documents and empty directories. Preserve unresolved sources until their topic is migrated.

ADRs are changed to `status: superseded` with `superseded-by`; they are never deleted. When code and a confirmed decision disagree, stop that topic and ask which authority should change. Ordinary differences between old prose and evolved code do not require confirmation.
