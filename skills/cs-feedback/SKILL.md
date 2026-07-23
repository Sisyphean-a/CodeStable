---
name: cs-feedback
description: "Evidence custody. Invoke only when the user asks to record or report feedback about CodeStable itself."
disable-model-invocation: true
argument-hint: "<feedback> [session] [publish]"
---

# Evidence custody

Collect only after explicit invocation. Evidence is private by default; collection never changes the target skill, project memory, or a public service.

## Steps

1. **Scope.** Obtain the user's feedback and one session: `current`, an id/path, or a user-approved recent search. When several sessions or incidents match, expose metadata and ask the user to choose. Complete when one capture boundary and trigger record are fixed.
2. **Collect.** Create a private directory under the host's temporary area and run:

   ```bash
   python {skill_dir}/scripts/collect_feedback_context.py --feedback "{feedback}" --session "{session}" --cwd "{cwd}" --output "{temp}/evidence.json"
   ```

   Use `--since-days N` instead of `--session` only when the user requested a recent search; use `--incident <id>` after explicit incident selection. Complete when `evidence.json` and `triage.json` are `schema_version: 3`, `privacy: local-private`, or collection failure is reported explicitly.
3. **Triage.** Ask only the first item in `quality.next_questions`. User-supplied expected/actual behavior must cite observation ids; unknown cause remains `unclassified`. Re-run against the same private directory after edits or selection. Complete when the primary incident is unambiguous and evidence gaps are visible.
4. **Preview on request.** Generate `github-issue.md` only from `public-issue-context.json`. It may contain exactly the incident allowlist: kind, target skill, expected behavior, actual behavior, impact, and proposed fix. Show the complete preview to the user. Complete when no transcript, local path, repository identity, environment value, secret, raw tool payload, or code block remains.
5. **Publish once authorized.** A request to preview or a `publish` argument is not authorization. After the user approves the displayed preview in the current turn, run:

   ```bash
   python {skill_dir}/scripts/report_feedback_issue.py --repo codestable/CodeStable --title "{title}" --body-file "{temp}/github-issue.md" --confirm-public-preview
   ```

   Complete when GitHub returns a URL or the exact manual fallback is reported. Never upload `evidence.json`, `triage.json`, or another private JSON file.

## Completion

The private capture boundary and triage quality are explicit. Public content, if any, came only from the allowlist and was published only after preview-specific approval. No background collection, project `.codestable` artifact, compatibility projection, regression fixture, or automatic target-skill edit was created.
