---
name: cs-feedback
description: "Evidence custody. Invoke only when the user asks to record or report feedback about CodeStable itself."
disable-model-invocation: true
argument-hint: "<feedback> [session] [publish]"
---

# Evidence custody

The selected incident and its triage are the canonical feedback record; preview and publication are projections of that record. Collect only after explicit invocation. Evidence is private by default; collection never changes the target skill, project memory, or a public service.

## Steps

1. **Scope.** Obtain the user's feedback and one session: `current`, an id/path, or a user-approved recent search. When several sessions or incidents match, expose metadata and ask the user to choose. Complete when one capture boundary and trigger record are fixed.
2. **Collect.** Create a private directory under the host's temporary area and run:

   ```bash
   python {skill_dir}/scripts/collect_feedback_context.py --feedback "{feedback}" --session "{session}" --cwd "{cwd}" --output "{temp}/evidence.json"
   ```

   Use `--since-days N` instead of `--session` only when the user requested a recent search; use `--incident <id>` after explicit incident selection. Complete when `evidence.json` and `triage.json` are `schema_version: 3`, `privacy: local-private`, or collection failure is reported explicitly.
3. **Triage.** Ask only the first item in `quality.next_questions`. User-supplied expected/actual behavior must cite ids from the selected incident's `observation_ids`; unknown cause remains `unclassified`. Re-run against the same private directory, whose capture anchor keeps the original trigger cutoff fixed unless the user explicitly selects another incident. Complete when the primary incident is unambiguous and evidence gaps are visible.
4. **Preview on request.** Build the preview from `public-issue-context.json`, which may contain exactly kind, target skill, expected behavior, actual behavior, impact, and proposed fix. Show the title `CodeStable feedback: {target_skill} {incident_kind}` and the complete rendered body. After the user approves this exact preview, rerun the collector with `--approve-public-preview --issue-body-output "{temp}/github-issue.md"`; approval is bound to the projection hash and expires when content changes. Complete when the approved files contain no transcript, local or relative code path, code filename, repository identity, environment value, secret, raw tool payload, or code block.
5. **Publish once authorized.** A request to preview or publish is not authorization. After preview-specific approval in the current turn, run:

   ```bash
   python {skill_dir}/scripts/report_feedback_issue.py --repo codestable/CodeStable --title "CodeStable feedback: {target_skill} {incident_kind}" --body-file "{temp}/github-issue.md" --public-context "{temp}/public-issue-context.json" --confirm-public-preview
   ```

   The publisher verifies the approved hash and executes `gh issue create` once; an ambiguous network response requires checking GitHub before any retry. Complete when GitHub returns a URL or the exact manual/unknown result is reported. Never upload private evidence or triage files.

## Completion

The private capture boundary and triage quality are explicit. Public content, if any, came only from the allowlist and was published only after preview-specific approval. No background collection, project `.codestable` artifact, compatibility projection, regression fixture, or automatic target-skill edit was created.
