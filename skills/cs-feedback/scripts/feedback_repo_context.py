from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path
from typing import Any

from feedback_privacy import public_redact
from feedback_transcripts import METADATA_TYPES, provider_from_path, session_id_from


ENVIRONMENT_METADATA_TYPES = METADATA_TYPES | {"turn_context"}
BODY_FIELDS = {"message", "content", "text", "output", "arguments", "input"}


def session_label(session: str) -> str:
    digest = hashlib.sha256(session.encode("utf-8")).hexdigest()[:10]
    return f"session-{digest}"


def _repo_root(cwd: Path) -> Path:
    try:
        completed = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=cwd,
            text=True,
            capture_output=True,
            timeout=5,
            check=False,
        )
        if completed.returncode == 0 and completed.stdout.strip():
            root = Path(completed.stdout.strip()).resolve()
            if root.is_dir():
                return root
    except (OSError, subprocess.TimeoutExpired):
        pass
    return cwd.resolve()


def _git_output(root: Path, args: list[str]) -> str:
    try:
        completed = subprocess.run(
            ["git", *args], cwd=root, text=True, capture_output=True, timeout=5, check=False
        )
    except (OSError, subprocess.TimeoutExpired):
        return ""
    return completed.stdout.strip() if completed.returncode == 0 else ""


def build_repo_context(cwd: str | None) -> dict[str, object]:
    if not cwd or not Path(cwd).is_dir():
        return {"git_head": "unknown", "dirty_paths": [], "private_tokens": []}
    root = _repo_root(Path(cwd))
    head = _git_output(root, ["rev-parse", "--short", "HEAD"]) or "unknown"
    status = _git_output(root, ["status", "--short", "--untracked-files=all"])
    dirty_paths = [line[3:] for line in status.splitlines()[:100] if len(line) >= 4]
    remote = _git_output(root, ["remote", "get-url", "origin"])
    remote_clean = remote.removesuffix(".git")
    remote_match = __import__("re").search(r"(?:[:/]([^/:]+/[^/]+))$", remote_clean)
    remote_parts = remote_match.group(1).split("/") if remote_match else []
    private_tokens = sorted({token for token in [root.name, *remote_parts] if token})
    return {"git_head": head, "dirty_paths": dirty_paths, "private_tokens": private_tokens}


def environment_context(
    path: Path,
    records: list[dict[str, Any]],
    capture: dict[str, Any],
) -> dict[str, object]:
    model = "unknown"
    host_version = "unknown"
    for record in records:
        payload = record.get("payload") if isinstance(record.get("payload"), dict) else record
        record_type = str(record.get("type") or payload.get("type") or "")
        top_level_metadata = any(key in record for key in ("session_id", "sessionId", "cwd")) and not BODY_FIELDS.intersection(record)
        if record_type not in ENVIRONMENT_METADATA_TYPES and not top_level_metadata:
            continue
        if model == "unknown" and payload.get("model"):
            model = public_redact(str(payload["model"]), limit=120)
        version = payload.get("version") or payload.get("client_version") or payload.get("cli_version")
        if host_version == "unknown" and version:
            host_version = public_redact(str(version), limit=120)
        if model != "unknown" and host_version != "unknown":
            break
    return {
        "provider": provider_from_path(path),
        "session": session_label(session_id_from(path, records)),
        "model": model,
        "host_version": host_version,
        "capture": capture,
    }
