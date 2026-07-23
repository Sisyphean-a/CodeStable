#!/usr/bin/env python3
"""Collect private CodeStable feedback evidence and a public allowlist projection."""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from dataclasses import asdict
from pathlib import Path
from typing import Any

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from feedback_incidents import build_incident_payload, public_incident  # noqa: E402
from feedback_models import PUBLIC_INCIDENT_FIELDS  # noqa: E402
from feedback_repo_context import session_label  # noqa: E402
from feedback_transcripts import discover_files, provider_from_path, read_transcript_snapshot, session_id_from  # noqa: E402
from feedback_triage import build_triage, merge_existing_triage  # noqa: E402


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


def main_with_args_for_test(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--feedback", required=True, help="User's feedback text")
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--session", help="current, a session id substring, or transcript path")
    scope.add_argument("--since-days", type=int, help="Search recent sessions")
    parser.add_argument("--output", required=True, help="Private evidence JSON")
    parser.add_argument("--triage-output", help="Private triage JSON")
    parser.add_argument("--public-output", help="Public allowlist JSON")
    parser.add_argument("--history-root", help="Override home directory for tests")
    parser.add_argument("--cwd", help="Current repository, required by --session current")
    parser.add_argument("--incident", help="Explicit incident id when several are found")
    args = parser.parse_args(argv)

    output = Path(args.output).expanduser()
    triage_output = Path(args.triage_output).expanduser() if args.triage_output else output.with_name("triage.json")
    public_output = Path(args.public_output).expanduser() if args.public_output else output.with_name("public-issue-context.json")
    try:
        resolved = [path.resolve() for path in (output, triage_output, public_output)]
    except OSError as exc:
        print(f"feedback output blocked: {exc}", file=sys.stderr)
        return 2
    if len(set(resolved)) != 3:
        print("feedback output blocked: output paths must be distinct", file=sys.stderr)
        return 2

    try:
        existing_triage = _load_existing_triage(triage_output)
    except ValueError as exc:
        print(f"feedback output blocked: {exc}", file=sys.stderr)
        return 2

    home = Path(args.history_root).expanduser() if args.history_root else Path.home()
    since_days = args.since_days if args.since_days is not None else 3
    cwd = str(Path(args.cwd).expanduser()) if args.cwd else None
    files, ambiguity = discover_files(home, since_days, args.session, cwd)
    if ambiguity:
        metadata = {"privacy": "local-private", "ambiguity": [asdict(item) for item in ambiguity]}
        _write_text_files_atomically([(output, json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")])
        print("feedback session selection required", file=sys.stderr)
        return 3

    records_by_path: dict[Path, list[dict[str, Any]]] = {}
    captures_by_path: dict[Path, dict[str, Any]] = {}
    for path in files:
        records_by_path[path], captures_by_path[path] = read_transcript_snapshot(path)

    incidents, primary = build_incident_payload(files, args.feedback, cwd, records_by_path, captures_by_path)
    if args.incident:
        primary = next((item for item in incidents if item.get("id") == args.incident), None)
        if primary is None:
            print(f"incident selection blocked: {args.incident} not found", file=sys.stderr)
            return 2
    generated = build_triage(incidents, primary)
    try:
        triage = merge_existing_triage(generated, existing_triage)
    except ValueError as exc:
        print(f"feedback output blocked: {exc}", file=sys.stderr)
        return 2

    quality = triage.get("quality") if isinstance(triage.get("quality"), dict) else {}
    public_incidents = [public_incident(primary, triage)] if primary and quality.get("triage_ready") is True else []
    public_issue_context = {
        "privacy": "public-preview",
        "source": "derived-from-local-private-evidence",
        "allowed_fields": PUBLIC_INCIDENT_FIELDS,
        "incidents": public_incidents,
    }
    payload = {
        "schema_version": 3,
        "feedback": args.feedback,
        "privacy": "local-private",
        "public_upload_allowed": False,
        "redaction": "best-effort",
        "session_filter": args.session,
        "since_days": args.since_days,
        "history_root": str(home),
        "cwd": cwd,
        "searched_files": [str(path) for path in files],
        "captures": [
            {
                "provider": provider_from_path(path),
                "session_label": session_label(session_id_from(path, records_by_path[path])),
                **captures_by_path[path],
            }
            for path in files
        ],
        "incidents": incidents,
    }
    try:
        _write_text_files_atomically(
            [
                (triage_output, json.dumps(triage, ensure_ascii=False, indent=2) + "\n"),
                (output, json.dumps(payload, ensure_ascii=False, indent=2) + "\n"),
                (public_output, json.dumps(public_issue_context, ensure_ascii=False, indent=2) + "\n"),
            ]
        )
    except OSError as exc:
        print(f"feedback output blocked: {exc}", file=sys.stderr)
        return 2
    return 0


def main() -> int:
    return main_with_args_for_test()


if __name__ == "__main__":
    raise SystemExit(main())
