#!/usr/bin/env python3
"""Collect private CodeStable feedback evidence and a public allowlist projection."""

from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import sys
import tempfile
from dataclasses import asdict
from pathlib import Path
from typing import Any

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
TARGET_REPO_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from feedback_incidents import build_incident_payload, public_incident  # noqa: E402
from feedback_models import PUBLIC_INCIDENT_FIELDS  # noqa: E402
from feedback_privacy import (  # noqa: E402
    publication_approval_hash,
    public_projection_hash,
    render_public_issue,
)
from feedback_repo_context import session_label  # noqa: E402
from feedback_transcripts import discover_files, provider_from_path, read_transcript_snapshot, session_id_from  # noqa: E402
from feedback_triage import build_triage, merge_existing_triage  # noqa: E402


def _load_capture_anchor(path: Path) -> dict[str, str] | None:
    """Keep a selected incident bound to the same transcript cutoff on reruns."""
    anchor_path = path.with_name("capture-anchor.json")
    if not anchor_path.exists():
        return None
    try:
        loaded = json.loads(anchor_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(loaded, dict):
        return None
    session = loaded.get("session")
    cutoff = loaded.get("cutoff")
    return {"session": str(session), "cutoff": str(cutoff)} if session and cutoff else None


def _write_capture_anchor(path: Path, session: str, cutoff: str) -> None:
    anchor_path = path.with_name("capture-anchor.json")
    anchor_path.write_text(
        json.dumps({"session": session, "cutoff": cutoff}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _load_existing_triage(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    if not path.is_file():
        raise ValueError(f"existing triage is not a file: {path}")
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"cannot read existing triage: {exc}") from exc
    if not isinstance(loaded, dict):
        raise ValueError("existing triage must be a JSON object")
    if loaded.get("schema_version") != 3 or loaded.get("privacy") != "local-private":
        raise ValueError("existing triage must be schema v3 local-private")
    return loaded


def _write_text_files_atomically(files: list[tuple[Path, str]]) -> None:
    staged: list[tuple[Path, Path]] = []
    try:
        for target, text in files:
            target.parent.mkdir(parents=True, exist_ok=True)
            handle = tempfile.NamedTemporaryFile(
                mode="w", encoding="utf-8", dir=target.parent,
                prefix=f".{target.name}.", suffix=".tmp", delete=False,
            )
            temporary = Path(handle.name)
            with handle:
                handle.write(text)
                handle.flush()
                os.fsync(handle.fileno())
            staged.append((temporary, target))
        for temporary, target in staged:
            os.replace(temporary, target)
    finally:
        for temporary, _target in staged:
            temporary.unlink(missing_ok=True)


def _collector_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--feedback", required=True, help="User's feedback text")
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--session", help="current, a session id substring, or transcript path")
    scope.add_argument("--since-days", type=int, help="Search recent sessions")
    parser.add_argument("--output", required=True, help="Private evidence JSON")
    parser.add_argument("--triage-output", help="Private triage JSON")
    parser.add_argument("--public-output", help="Public allowlist JSON")
    parser.add_argument("--issue-body-output", help="已批准的公开 issue 正文")
    parser.add_argument("--approval-output", help="一次性发布批准文件")
    parser.add_argument("--target-repo", help="批准发布到的 owner/repo")
    parser.add_argument("--history-root", help="Override home directory for tests")
    parser.add_argument("--cwd", help="Current repository, required by --session current")
    parser.add_argument("--incident", help="Explicit incident id when several are found")
    parser.add_argument("--approve-public-preview", action="store_true")
    return parser


def _collector_paths(args: argparse.Namespace) -> dict[str, Path]:
    output = Path(args.output).expanduser()
    return {
        "output": output,
        "triage": Path(args.triage_output).expanduser() if args.triage_output else output.with_name("triage.json"),
        "public": Path(args.public_output).expanduser() if args.public_output else output.with_name("public-issue-context.json"),
        "approval": Path(args.approval_output).expanduser() if args.approval_output else output.with_name("publish-approval.json"),
    }


def _validate_collector_paths(paths: dict[str, Path]) -> list[Path]:
    try:
        resolved = [paths[key].resolve() for key in ("output", "triage", "public")]
        approval = paths["approval"].resolve()
    except OSError as exc:
        raise ValueError(f"feedback output blocked: {exc}") from exc
    if len(set(resolved)) != 3 or approval in resolved:
        raise ValueError("反馈输出被阻止：输出路径必须互不相同")
    paths["approval"].unlink(missing_ok=True)
    paths["approval"].with_name(paths["approval"].name + ".used").unlink(missing_ok=True)
    return resolved


def _collector_environment(args: argparse.Namespace) -> tuple[Path, int, str | None]:
    home = Path(args.history_root).expanduser() if args.history_root else Path.home()
    since_days = args.since_days if args.since_days is not None else 3
    cwd = str(Path(args.cwd).expanduser()) if args.cwd else None
    return home, since_days, cwd


def _select_files(
    args: argparse.Namespace,
    paths: dict[str, Path],
    home: Path,
    *,
    since_days: int,
    cwd: str | None,
) -> list[Path] | None:
    files, ambiguity = discover_files(home, since_days, args.session, cwd=cwd)
    if not ambiguity:
        return files
    metadata = {"privacy": "local-private", "ambiguity": [asdict(item) for item in ambiguity]}
    _write_text_files_atomically([
        (paths["output"], json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    ])
    print("feedback session selection required", file=sys.stderr)
    return None


def _transcript_snapshots(
    files: list[Path],
) -> tuple[dict[Path, list[dict[str, Any]]], dict[Path, dict[str, Any]]]:
    records: dict[Path, list[dict[str, Any]]] = {}
    captures: dict[Path, dict[str, Any]] = {}
    for path in files:
        records[path], captures[path] = read_transcript_snapshot(path)
    return records, captures


def _anchored_primary(
    incidents: list[dict[str, object]],
    anchor: dict[str, str] | None,
) -> dict[str, object] | None:
    if not anchor:
        return None
    return next(
        (
            item for item in incidents
            if item.get("capture_cutoff") == anchor["cutoff"]
            and isinstance(item.get("environment_context"), dict)
            and item["environment_context"].get("session") == anchor["session"]
        ),
        None,
    )


def _selected_primary(
    args: argparse.Namespace,
    incidents: list[dict[str, object]],
    primary: dict[str, object] | None,
    *,
    anchor: dict[str, str] | None,
) -> dict[str, object] | None:
    if args.incident:
        selected = next((item for item in incidents if item.get("id") == args.incident), None)
        if selected is None:
            raise ValueError(f"incident selection blocked: {args.incident} not found")
        return selected
    return _anchored_primary(incidents, anchor) if anchor else primary


def _primary_anchor(primary: dict[str, object]) -> dict[str, str]:
    environment = primary.get("environment_context")
    context = environment if isinstance(environment, dict) else {}
    return {
        "session": str(context.get("session") or "unknown"),
        "cutoff": str(primary.get("capture_cutoff") or "unknown"),
    }


def _resolve_incidents(
    args: argparse.Namespace,
    paths: dict[str, Path],
    files: list[Path],
    *,
    cwd: str | None,
    records: dict[Path, list[dict[str, Any]]],
    captures: dict[Path, dict[str, Any]],
) -> tuple[list[dict[str, object]], dict[str, object] | None, dict[str, str] | None]:
    anchor = _load_capture_anchor(paths["output"])
    incidents, primary = build_incident_payload(
        files,
        args.feedback,
        cwd,
        records_by_path=records,
        captures_by_path=captures,
    )
    primary = _selected_primary(args, incidents, primary, anchor=anchor)
    if primary and (not anchor or args.incident):
        anchor = _primary_anchor(primary)
        _write_capture_anchor(paths["output"], anchor["session"], anchor["cutoff"])
    return incidents, primary, anchor


def _public_projection(
    primary: dict[str, object] | None,
    triage: dict[str, Any],
) -> dict[str, object]:
    quality = triage.get("quality") if isinstance(triage.get("quality"), dict) else {}
    ready = primary is not None and quality.get("triage_ready") is True
    return {
        "privacy": "public-preview",
        "source": "derived-from-local-private-evidence",
        "allowed_fields": PUBLIC_INCIDENT_FIELDS,
        "incidents": [public_incident(primary, triage)] if ready else [],
    }


def _pending_review() -> dict[str, object]:
    return {
        "status": "pending",
        "projection_hash": "",
        "target_repo": "",
        "approval_id": "",
        "approval_hash": "",
        "notes": "需要本轮重新批准",
    }


def _approved_review(
    projection_hash: str,
    target_repo: str,
) -> tuple[dict[str, object], dict[str, object]]:
    approval_id = secrets.token_urlsafe(24)
    approval_hash = publication_approval_hash(projection_hash, target_repo, approval_id)
    review = {
        "status": "approved",
        "projection_hash": projection_hash,
        "target_repo": target_repo,
        "approval_id": approval_id,
        "approval_hash": approval_hash,
        "notes": "用户已批准此投影发布到指定仓库",
    }
    approval = {**review, "privacy": "local-private", "status": "available"}
    return review, approval


def _projection_review(
    args: argparse.Namespace,
    projection: dict[str, object],
) -> tuple[str, dict[str, object], dict[str, object] | None]:
    projection_hash = public_projection_hash(projection)
    if not args.approve_public_preview:
        return projection_hash, _pending_review(), None
    if not projection["incidents"]:
        raise ValueError("public preview approval blocked: triage is not ready")
    if not args.target_repo or not TARGET_REPO_PATTERN.fullmatch(args.target_repo):
        raise ValueError("公开预览批准被阻止：--target-repo 必须是单个 owner/repo")
    review, approval = _approved_review(projection_hash, args.target_repo)
    return projection_hash, review, approval


def _capture_anchor(
    anchor: dict[str, str] | None,
    primary: dict[str, object] | None,
) -> dict[str, str]:
    return anchor or (_primary_anchor(primary) if primary else {"session": "unknown", "cutoff": "unknown"})


def _evidence_payload(
    args: argparse.Namespace,
    state: dict[str, Any],
) -> dict[str, object]:
    return {
        "schema_version": 3,
        "feedback": args.feedback,
        "privacy": "local-private",
        "public_upload_allowed": False,
        "redaction": "best-effort",
        "session_filter": args.session,
        "since_days": args.since_days,
        "history_root": str(state["home"]),
        "cwd": state["cwd"],
        "capture_anchor": _capture_anchor(state["anchor"], state["primary"]),
        "searched_files": [str(path) for path in state["files"]],
        "captures": [
            {
                "provider": provider_from_path(path),
                "session_label": session_label(session_id_from(path, state["records"][path])),
                **state["captures"][path],
            }
            for path in state["files"]
        ],
        "incidents": state["incidents"],
    }


def _collector_outputs(
    args: argparse.Namespace,
    paths: dict[str, Path],
    resolved: list[Path],
    *,
    state: dict[str, Any],
) -> list[tuple[Path, str]]:
    outputs = [
        (paths["triage"], json.dumps(state["triage"], ensure_ascii=False, indent=2) + "\n"),
        (paths["output"], json.dumps(_evidence_payload(args, state), ensure_ascii=False, indent=2) + "\n"),
        (paths["public"], json.dumps(state["context"], ensure_ascii=False, indent=2) + "\n"),
    ]
    if not args.approve_public_preview:
        return outputs
    issue_body = Path(args.issue_body_output).expanduser() if args.issue_body_output else paths["output"].with_name("github-issue.md")
    if issue_body.resolve() in [*resolved, paths["approval"].resolve()]:
        raise ValueError("feedback output blocked: issue body path must be distinct")
    outputs.append((issue_body, render_public_issue(state["context"])))
    outputs.append((paths["approval"], json.dumps(state["approval"], ensure_ascii=False, indent=2) + "\n"))
    return outputs


def _collect_state(
    args: argparse.Namespace,
    paths: dict[str, Path],
    files: list[Path],
    *,
    home: Path,
    cwd: str | None,
    existing_triage: dict[str, Any] | None,
) -> dict[str, Any]:
    records, captures = _transcript_snapshots(files)
    incidents, primary, anchor = _resolve_incidents(
        args,
        paths,
        files,
        cwd=cwd,
        records=records,
        captures=captures,
    )
    triage = merge_existing_triage(build_triage(incidents, primary), existing_triage)
    projection = _public_projection(primary, triage)
    projection_hash, review, approval = _projection_review(args, projection)
    triage["privacy_review"] = review
    context = {**projection, "projection_hash": projection_hash, "privacy_review": review}
    return {
        "home": home,
        "cwd": cwd,
        "files": files,
        "records": records,
        "captures": captures,
        "incidents": incidents,
        "primary": primary,
        "anchor": anchor,
        "triage": triage,
        "context": context,
        "approval": approval,
    }


def main_with_args_for_test(argv: list[str] | None = None) -> int:
    args = _collector_parser().parse_args(argv)
    paths = _collector_paths(args)
    try:
        resolved = _validate_collector_paths(paths)
        existing_triage = _load_existing_triage(paths["triage"])
        home, since_days, cwd = _collector_environment(args)
        files = _select_files(args, paths, home, since_days=since_days, cwd=cwd)
        if files is None:
            return 3
        state = _collect_state(
            args,
            paths,
            files,
            home=home,
            cwd=cwd,
            existing_triage=existing_triage,
        )
        outputs = _collector_outputs(args, paths, resolved, state=state)
        _write_text_files_atomically(outputs)
    except (OSError, ValueError) as exc:
        print(f"feedback output blocked: {exc}", file=sys.stderr)
        return 2
    return 0


def main() -> int:
    return main_with_args_for_test()


if __name__ == "__main__":
    raise SystemExit(main())
