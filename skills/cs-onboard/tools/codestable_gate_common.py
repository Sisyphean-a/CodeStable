#!/usr/bin/env python3
"""Shared helpers for minimal CodeStable gate scripts."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable

sys.dont_write_bytecode = True


def repo_root() -> Path:
    current = Path.cwd()
    for path in (current, *current.parents):
        if (path / ".git").exists() or (path / ".codestable").exists():
            return path
    return current


def repo_relative_path(root: Path, value: str | Path) -> str:
    path = Path(value)
    resolved = (path if path.is_absolute() else Path.cwd() / path).resolve()
    try:
        return resolved.relative_to(root.resolve()).as_posix()
    except ValueError:
        return resolved.as_posix()


def file_sha256(path: str | Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read_text(path: str | Path) -> str:
    return Path(path).read_text(encoding="utf-8")


def gate_result(
    gate_id: str,
    stage: str,
    status: str,
    blocking: list[str] | None = None,
    warnings: list[str] | None = None,
    evidence: list[Any] | None = None,
    feature: str | None = None,
    inputs: dict[str, str] | None = None,
    input_digests: dict[str, str] | None = None,
) -> dict[str, Any]:
    result = {
        "gate_id": gate_id,
        "stage": stage,
        "status": status,
        "blocking": blocking or [],
        "warnings": warnings or [],
        "evidence": evidence or [],
        "providers": {},
    }
    if feature:
        result["feature"] = feature
    if inputs is not None:
        result["inputs"] = inputs
    if input_digests is not None:
        result["input_digests"] = input_digests
    return result


def print_json(data: dict[str, Any]) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


def exit_for_status(status: str) -> int:
    return 0 if status in {"passed", "skipped"} else 1


def parse_args(description: str) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--json-out", help="Optional path to write JSON result")
    return parser


def write_optional_json(result: dict[str, Any], json_out: str | None) -> None:
    if json_out:
        Path(json_out).parent.mkdir(parents=True, exist_ok=True)
        Path(json_out).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def run_command(command: str, cwd: Path) -> dict[str, Any]:
    completed = subprocess.run(
        command,
        cwd=cwd,
        shell=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    return {
        "command": command,
        "exit_code": completed.returncode,
        "stdout": completed.stdout[-4000:],
        "stderr": completed.stderr[-4000:],
    }


def load_yaml(path: Path) -> Any:
    return load_yaml_text(path.read_text(encoding="utf-8"))


def load_yaml_text(text: str) -> Any:
    try:
        import yaml  # type: ignore
    except ImportError as error:
        raise RuntimeError("PyYAML is required for strict CodeStable gate artifact parsing") from error
    parsed = yaml.safe_load(text)
    return {} if parsed is None else parsed


def canonical_approval_report_path(unit: Path) -> tuple[Path | None, str]:
    """Resolve the canonical approval report without leaving its workflow unit."""
    unit_root = unit.resolve()
    approval_path = (unit / "approval-report.md").resolve()
    try:
        approval_path.relative_to(unit_root)
    except ValueError:
        return None, "approval-report.md escapes the workflow unit"
    return approval_path, ""


def named_authorization_state(
    unit: Path,
    state: dict[str, Any],
    field: str,
    decision_id: str,
    frontmatter_loader: Callable[[Path], dict[str, Any]],
) -> tuple[str, str, str]:
    """Validate a persisted authorization against its canonical named decision."""
    status = str(state.get(field) or "").strip()
    reference = str(state.get(f"{field}_ref") or "").strip()
    if status == "rejected":
        return "rejected", reference, ""
    if status != "approved":
        return "missing", reference, f"{field} is not approved"

    path_text, separator, fragment = reference.partition("#")
    if not separator or not path_text or fragment != decision_id:
        return "missing", reference, f"{field}_ref must be approval-report.md#{decision_id}"

    canonical_path, canonical_reason = canonical_approval_report_path(unit)
    if canonical_path is None:
        return "missing", reference, canonical_reason

    unit_root = unit.resolve()
    approval_path = (unit / path_text).resolve()
    try:
        approval_path.relative_to(unit_root)
    except ValueError:
        return "missing", reference, f"{field}_ref escapes the workflow unit"
    if approval_path != canonical_path:
        return "missing", reference, f"{field}_ref must target the unit approval-report.md"

    approval = frontmatter_loader(approval_path)
    approvals = approval.get("approvals")
    if approval.get("doc_type") != "approval-report" or not isinstance(approvals, dict):
        return "missing", reference, f"{field}_ref does not target a named approval decision"
    decision_status = str(approvals.get(decision_id) or "").strip()
    if decision_status == "rejected":
        return "rejected", reference, f"approval decision {decision_id} was rejected"
    if decision_status != "approved":
        return "missing", reference, f"approval decision {decision_id} is not approved"
    return "approved", reference, ""


def named_approval_group_state(
    unit: Path,
    group_id: str,
    expected_decisions: tuple[str, ...],
    frontmatter_loader: Callable[[Path], dict[str, Any]],
) -> tuple[str, str, str]:
    """Validate one durable owner answer that approves multiple named decisions."""
    approval_path, canonical_reason = canonical_approval_report_path(unit)
    if approval_path is None:
        return "missing", "", canonical_reason
    approval = frontmatter_loader(approval_path)
    if not approval:
        return "absent", "", "approval-report.md has no approval group"
    if approval.get("doc_type") != "approval-report":
        return "missing", "", "goal execution confirmation requires canonical approval-report.md"

    groups = approval.get("approval_groups")
    if groups is None:
        return "absent", "", f"approval group {group_id} is absent"
    if not isinstance(groups, dict) or not isinstance(groups.get(group_id), dict):
        return "missing", "", f"approval group {group_id} is invalid"

    group = groups[group_id]
    confirmation_id = str(group.get("confirmation_id") or "").strip()
    status = str(group.get("status") or "").strip()
    decisions = group.get("decisions")
    approvals = approval.get("approvals")
    if isinstance(approvals, dict):
        for decision_id in expected_decisions:
            if str(approvals.get(decision_id) or "").strip() == "rejected":
                return "rejected", confirmation_id, f"approval decision {decision_id} was rejected"
    if status == "rejected":
        return "rejected", confirmation_id, f"approval group {group_id} was rejected"
    if status != "approved":
        return "missing", confirmation_id, f"approval group {group_id} is not approved"
    if not confirmation_id:
        return "missing", "", f"approval group {group_id} has no confirmation_id"
    if (
        not isinstance(decisions, list)
        or any(not isinstance(decision, str) for decision in decisions)
        or len(decisions) != len(expected_decisions)
        or set(decisions) != set(expected_decisions)
    ):
        return "missing", confirmation_id, f"approval group {group_id} decisions do not match"

    if not isinstance(approvals, dict):
        return "missing", confirmation_id, f"approval group {group_id} has no named decisions"
    for decision_id in expected_decisions:
        decision_status = str(approvals.get(decision_id) or "").strip()
        if decision_status != "approved":
            return "missing", confirmation_id, f"approval decision {decision_id} is not approved"
    return "approved", confirmation_id, ""


def main_exit(result: dict[str, Any], json_out: str | None = None) -> None:
    write_optional_json(result, json_out)
    print_json(result)
    sys.exit(exit_for_status(str(result.get("status", "blocked"))))
