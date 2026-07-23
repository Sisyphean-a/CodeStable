---
name: cs-audit
description: "Findings audit. Use when the user asks to scan a named codebase scope for bugs, security risks, performance problems, or architecture debt without implementing fixes."
argument-hint: "<scope and audit dimensions>"
---

# Findings audit

Produce evidence-backed findings. This run is read-only unless the user explicitly changes the task.

## Steps

1. **Frame.** Fix the code scope, audit dimensions, and applicable current contracts. Read scoped project memory; load ADRs only when testing architectural or policy conformance. Complete when coverage boundaries and exclusions are explicit.
2. **Inspect.** Trace relevant code paths and run non-mutating checks. Complete when each in-scope dimension has been investigated, not merely sampled from the first matches.
3. **Challenge.** For every candidate, verify the trigger, impact, exact location, confidence, and why existing tests or controls do not already settle it. Remove speculation that cannot survive this check. Complete when every remaining finding is reproducible or directly evidenced.
4. **Report.** Lead with findings ordered by severity. Include location, conditions, impact, confidence, and the smallest useful remediation direction; then state coverage and residual risk. Complete when zero findings is reported plainly rather than padded with process commentary.
5. **Remember only on request.** Default output stays in the conversation. If the user explicitly asks to preserve a conclusion and it affects future judgment, write it to its canonical current-state owner using [the memory model](../cs-domain/references/memory-model.md), not an audit directory.

For a security-focused audit, read [the high-risk classification and review rules](../cs-code-review/references/high-risk.md); authorization is required only before a risky side effect, not for read-only inspection.

## Completion

All named dimensions were covered, every finding has concrete evidence, residual risk is visible, and no fix or audit process document was created.
