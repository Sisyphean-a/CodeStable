# High-risk branch

Load this file only when work affects one or more of:

- authentication, authorization, secrets, privacy, or security boundaries;
- persisted data shape, migration, deletion, or recovery;
- production infrastructure or live operations;
- irreversible external effects such as publication, billing, messaging, or destructive commands;
- a core protocol shared across packages or external consumers.

## Before the risky action

State the exact scope, affected assets, expected effect, rollback or recovery path, and evidence available before execution. Obtain explicit user authorization for the concrete destructive, production, data, or external action. Authorization for analysis or implementation does not imply authorization to execute the side effect.

Prefer a reversible rehearsal or backup when it proves the same operation. Keep failure visible; a fallback, partial success, or skipped migration must be explicit.

## Verification and review

Use the strongest available check for the risk: restore test for backup, forward/backward compatibility for migration, least-privilege checks for security, dry-run diff for infrastructure, idempotency for externally repeated actions, and consumer tests for shared protocols.

After implementation and verification, perform one independent adversarial review of the final diff. Independence means a fresh reviewer context that did not author the change. Resolve blocking findings and review only the resulting delta when fixes are local; repeat the full review only when the risk boundary changes. Keep the review in the conversation or normal code-host review. Persist a conclusion only when it changes project current state or leaves a future-relevant residual risk.

## Completion

Authorization matches the action actually executed, recovery is viable, risk-specific verification passes, one independent review has no unresolved blocking finding, and any lasting decision or residual risk is recorded through the canonical memory threshold.
