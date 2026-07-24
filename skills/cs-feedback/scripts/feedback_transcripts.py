from __future__ import annotations

import json
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

from feedback_models import Candidate, NormalizedRecord, SessionMeta
from feedback_privacy import public_redact, redact


METADATA_TYPES = {"session_meta", "metadata", "system_meta"}
TOOL_CALL_TYPES = {"function_call", "tool_call", "tool_use"}
TOOL_RESULT_TYPES = {"function_call_output", "tool_result", "tool_output"}


def flatten(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "\n".join(flatten(item) for item in value)
    if isinstance(value, dict):
        parts: list[str] = []
        for key in (
            "message",
            "text",
            "output",
            "content",
            "arguments",
            "input",
            "name",
            "type",
            "role",
        ):
            if key in value:
                parts.append(flatten(value[key]))
        if parts:
            return "\n".join(part for part in parts if part)
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return str(value)


def event_text(record: dict[str, Any]) -> str:
    payload = record.get("payload", record)
    return flatten(payload)


def normalize_json_records(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item if isinstance(item, dict) else {"payload": item} for item in value]
    if not isinstance(value, dict):
        return [{"payload": value}]

    collection_keys = ("messages", "events", "entries", "items", "transcript")
    records: list[dict[str, Any]] = []
    meta = {key: item for key, item in value.items() if key not in collection_keys}
    if meta:
        records.append(meta)
    for key in collection_keys:
        items = value.get(key)
        if not isinstance(items, list):
            continue
        for item in items:
            records.append(item if isinstance(item, dict) else {"payload": item})
    return records or [value]


def read_transcript_snapshot(path: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Read one immutable byte snapshot and report the last complete record boundary."""
    raw = path.read_bytes()
    if path.suffix == ".json":
        try:
            value = json.loads(raw.decode("utf-8", errors="ignore"))
        except json.JSONDecodeError:
            return [], {"format": "json", "byte_length": len(raw), "complete_record_eof": 0}
        return normalize_json_records(value), {
            "format": "json",
            "byte_length": len(raw),
            "complete_record_eof": len(raw),
        }

    records: list[dict[str, Any]] = []
    offset = 0
    complete_record_eof = 0
    for raw_line in raw.splitlines(keepends=True):
        offset += len(raw_line)
        line = raw_line.strip()
        if not line:
            continue
        try:
            value = json.loads(line.decode("utf-8", errors="ignore"))
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            records.append(value)
            complete_record_eof = offset
    return records, {
        "format": "jsonl",
        "byte_length": len(raw),
        "complete_record_eof": complete_record_eof,
    }


def _session_id_from_record(record: dict[str, Any]) -> str:
    payload = record.get("payload")
    if isinstance(payload, dict):
        session_id = (
            payload.get("session_id")
            or payload.get("sessionId")
            or payload.get("sessionid")
            or payload.get("id")
        )
        if session_id:
            return str(session_id)
    session_id = (
        record.get("session_id")
        or record.get("sessionId")
        or record.get("sessionid")
        or record.get("id")
    )
    return str(session_id) if session_id else ""


def _cwd_from_record(record: dict[str, Any]) -> str:
    payload = record.get("payload")
    payload_type = payload.get("type") if isinstance(payload, dict) else None
    record_type = record.get("type")
    if (
        isinstance(payload, dict)
        and payload.get("cwd")
        and (record_type == "session_meta" or payload_type == "session_meta")
    ):
        return str(payload["cwd"])
    body_keys = {"message", "content", "text", "output", "arguments", "input"}
    if record.get("cwd") and not body_keys.intersection(record):
        return str(record["cwd"])
    return ""


def _json_session_metadata(path: Path) -> SessionMeta:
    try:
        value = json.loads(path.read_bytes().decode("utf-8", errors="ignore"))
    except json.JSONDecodeError:
        return SessionMeta(path.stem, "")
    if not isinstance(value, dict):
        return SessionMeta(path.stem, "")
    session = str(
        value.get("session_id")
        or value.get("sessionId")
        or value.get("id")
        or path.stem
    )
    return SessionMeta(session, str(value.get("cwd") or ""))


def _jsonl_session_metadata(path: Path) -> SessionMeta:
    session = ""
    cwd = ""
    with path.open(encoding="utf-8", errors="ignore") as handle:
        for line in handle:
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(record, dict):
                continue
            session = session or _session_id_from_record(record)
            cwd = cwd or _cwd_from_record(record)
            if session and cwd:
                break
    return SessionMeta(session or path.stem, cwd)


def read_session_metadata(path: Path) -> SessionMeta:
    """Read only top-level or session-meta fields; never normalize message bodies."""
    return _json_session_metadata(path) if path.suffix == ".json" else _jsonl_session_metadata(path)


def session_id_from(path: Path, records: list[dict[str, Any]]) -> str:
    for record in records:
        session_id = _session_id_from_record(record)
        if session_id:
            return session_id
    return path.stem


def provider_from_path(path: Path) -> str:
    text = str(path)
    if ".codex" in text:
        return "codex"
    if ".claude" in text:
        return "claude"
    return "unknown"


def candidate_for(path: Path, cwd: str | None) -> Candidate:
    meta = read_session_metadata(path)
    score = 0
    if cwd and meta.cwd == cwd:
        score += 5
    elif cwd and meta.cwd and (cwd.startswith(meta.cwd) or meta.cwd.startswith(cwd)):
        score += 2
    score += int(path.stat().st_mtime // 60)
    return Candidate(
        path=str(path),
        provider=provider_from_path(path),
        session=meta.session,
        cwd=meta.cwd,
        mtime=path.stat().st_mtime,
        score=score,
    )


def resolve_current_session(
    files: list[Path], cwd: str | None
) -> tuple[list[Path], list[Candidate]]:
    candidates = [
        candidate_for(path, cwd) for path in files if path.suffix in {".jsonl", ".json"}
    ]
    candidates.sort(key=lambda candidate: candidate.score, reverse=True)
    if not candidates:
        return [], []
    if cwd:
        exact = [candidate for candidate in candidates if candidate.cwd == cwd]
        if len(exact) == 1:
            return [Path(exact[0].path)], []
        if len(exact) > 1:
            return [], exact[:5]
        containing = [
            candidate
            for candidate in candidates
            if candidate.cwd and (cwd.startswith(candidate.cwd) or candidate.cwd.startswith(cwd))
        ]
        if containing:
            return [], containing[:5]
    return [], candidates[:5]


def _history_files(home: Path) -> list[Path]:
    roots = [
        home / ".codex/sessions",
        home / ".claude/projects",
        home / ".claude/sessions",
    ]
    files: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.is_file() and path.suffix in {".jsonl", ".json"}:
                files.append(path)
    return sorted(files)


def _explicit_session_path(session_filter: str | None) -> Path | None:
    if not session_filter or session_filter == "current":
        return None
    candidate = Path(session_filter).expanduser()
    return candidate if candidate.is_file() else None


def _matches_session_filter(path: Path, session_filter: str | None) -> bool:
    if not session_filter or session_filter == "current":
        return True
    if session_filter in path.name or session_filter in str(path):
        return True
    return session_filter in read_session_metadata(path).session


def _recent_history_files(
    files: list[Path],
    since_days: int,
    session_filter: str | None,
) -> list[Path]:
    cutoff = time.time() - since_days * 86400
    return [
        path
        for path in files
        if path.stat().st_mtime >= cutoff and _matches_session_filter(path, session_filter)
    ]


def discover_files(
    home: Path,
    since_days: int,
    session_filter: str | None,
    *,
    cwd: str | None,
) -> tuple[list[Path], list[Candidate]]:
    explicit = _explicit_session_path(session_filter)
    if explicit:
        return [explicit], []
    all_files = _history_files(home)
    if session_filter == "current":
        return resolve_current_session(all_files, cwd)
    return _recent_history_files(all_files, since_days, session_filter), []


def _payload(record: dict[str, Any]) -> dict[str, Any]:
    payload = record.get("payload")
    return payload if isinstance(payload, dict) else record


def _metadata_record(record: dict[str, Any]) -> bool:
    payload = _payload(record)
    kind = str(payload.get("type") or record.get("type") or "")
    if kind in METADATA_TYPES:
        return True
    body_keys = {"message", "content", "text", "output", "arguments", "input"}
    has_meta = any(
        key in record for key in ("session_id", "sessionId", "sessionid", "cwd")
    )
    return has_meta and not body_keys.intersection(record)


def _message_container(record: dict[str, Any]) -> dict[str, Any] | None:
    message = record.get("message")
    if isinstance(message, dict):
        return message
    if "content" in record and (record.get("role") or record.get("type") in {"user", "assistant"}):
        return record
    return None


def _expanded_entry(
    role: str,
    record_type: str,
    *,
    tool_name: str = "unknown",
    call_id: str = "",
    text: str = "",
) -> dict[str, Any]:
    return {
        "role": role,
        "record_type": record_type,
        "tool_name": tool_name,
        "call_id": call_id,
        "text": text,
    }


def _tool_call_block(block: dict[str, Any]) -> dict[str, Any]:
    name = str(block.get("name") or block.get("tool_name") or "unknown")
    details = flatten(block.get("input") or block.get("arguments"))
    return _expanded_entry(
        "assistant",
        "tool_call",
        tool_name=name,
        call_id=str(block.get("id") or block.get("call_id") or ""),
        text="\n".join(part for part in (name, details) if part),
    )


def _tool_result_block(block: dict[str, Any]) -> dict[str, Any]:
    return _expanded_entry(
        "tool",
        "tool_result",
        tool_name=str(block.get("name") or block.get("tool_name") or "unknown"),
        call_id=str(
            block.get("tool_use_id")
            or block.get("tool_call_id")
            or block.get("call_id")
            or ""
        ),
        text=flatten(block.get("content") or block.get("output")),
    )


def _message_block(block: object, role: str) -> dict[str, Any] | None:
    if block is None:
        return None
    if isinstance(block, dict):
        kind = str(block.get("type") or "")
        if kind in TOOL_CALL_TYPES:
            return _tool_call_block(block)
        if kind in TOOL_RESULT_TYPES:
            return _tool_result_block(block)
        text = flatten(block.get("text") if kind == "text" else block)
    else:
        text = flatten(block)
    if not text:
        return None
    normalized_role = role if role in {"user", "assistant", "system"} else "unknown"
    return _expanded_entry(normalized_role, "message", text=text)


def _expanded_message_records(
    record: dict[str, Any],
    container: dict[str, Any],
) -> list[dict[str, Any]]:
    role = str(container.get("role") or record.get("role") or record.get("type") or "unknown")
    content = container.get("content")
    blocks = content if isinstance(content, list) else [content]
    return [entry for block in blocks if (entry := _message_block(block, role)) is not None]


def _first_value(
    source: dict[str, Any],
    keys: tuple[str, ...],
    default: str = "",
) -> str:
    for key in keys:
        value = source.get(key)
        if value:
            return str(value)
    return default


def _payload_kind(record: dict[str, Any], payload: dict[str, Any]) -> str:
    return _first_value(payload, ("type",), _first_value(record, ("type",), "unknown"))


def _payload_tool_record(
    record: dict[str, Any],
    payload: dict[str, Any],
) -> dict[str, Any] | None:
    kind = _payload_kind(record, payload)
    if kind not in TOOL_CALL_TYPES | TOOL_RESULT_TYPES:
        return None
    is_call = kind in TOOL_CALL_TYPES
    call_keys = ("call_id", "tool_call_id", "id") if is_call else (
        "call_id",
        "tool_call_id",
        "tool_use_id",
    )
    name_keys = ("name", "tool_name", "tool") if is_call else ("name", "tool_name")
    return _expanded_entry(
        "assistant" if is_call else "tool",
        "tool_call" if is_call else "tool_result",
        tool_name=_first_value(payload, name_keys, "unknown"),
        call_id=_first_value(payload, call_keys),
        text=event_text(record),
    )


def _message_role(kind: str, explicit_role: str) -> str:
    if explicit_role:
        return explicit_role
    if "user" in kind:
        return "user"
    if "assistant" in kind:
        return "assistant"
    return ""


def _payload_message_record(
    record: dict[str, Any],
    payload: dict[str, Any],
) -> dict[str, Any]:
    kind = _payload_kind(record, payload)
    role = _message_role(kind, _first_value(payload, ("role",), _first_value(record, ("role",))))
    normalized_role = role if role in {"user", "assistant", "tool", "system"} else "unknown"
    record_type = "message" if role or "message" in kind else kind
    return _expanded_entry(normalized_role, record_type, text=event_text(record))


def _expanded_records(record: dict[str, Any]) -> list[dict[str, Any]]:
    if _metadata_record(record):
        return [_expanded_entry("system", "session_meta")]
    container = _message_container(record)
    if container is not None:
        expanded = _expanded_message_records(record, container)
        if expanded:
            return expanded
    payload = _payload(record)
    tool_record = _payload_tool_record(record, payload)
    return [tool_record or _payload_message_record(record, payload)]


def _fallback_tool_name(text: str) -> str:
    for candidate in ("apply_patch", "read_file", "git", "gh", "paseo", "mcp"):
        if candidate in text.lower():
            return candidate
    return "unknown"


def _normalized_entry(
    expanded: dict[str, Any],
    timestamp: str,
    source_index: int,
) -> dict[str, Any]:
    text = redact(str(expanded["text"]), limit=800)
    tool_name = str(expanded["tool_name"])
    if tool_name == "unknown":
        tool_name = _fallback_tool_name(text)
    return {
        **expanded,
        "timestamp": timestamp,
        "text": text,
        "tool_name": public_redact(tool_name, limit=80),
        "source_index": source_index,
        "correlation_id": "",
        "correlation_source": "unpaired",
    }


def _normalized_entries(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for source_index, record in enumerate(records):
        timestamp = str(record.get("timestamp") or record.get("created_at") or "")
        entries.extend(
            _normalized_entry(expanded, timestamp, source_index)
            for expanded in _expanded_records(record)
        )
    return entries


def _entries_by_call_id(
    entries: list[dict[str, Any]],
) -> tuple[dict[str, list[int]], dict[str, list[int]]]:
    calls: dict[str, list[int]] = defaultdict(list)
    results: dict[str, list[int]] = defaultdict(list)
    for index, entry in enumerate(entries):
        call_id = str(entry["call_id"])
        target = calls if entry["record_type"] == "tool_call" else results
        if call_id and entry["record_type"] in {"tool_call", "tool_result"}:
            target[call_id].append(index)
    return calls, results


def _apply_provider_correlations(entries: list[dict[str, Any]]) -> None:
    calls_by_id, results_by_id = _entries_by_call_id(entries)
    for call_id in set(calls_by_id) & set(results_by_id):
        indexes = [*calls_by_id[call_id], *results_by_id[call_id]]
        if len(indexes) != 2:
            continue
        for index in indexes:
            entries[index]["correlation_id"] = call_id
            entries[index]["correlation_source"] = "provider"


def _apply_adjacency_pair(
    entries: list[dict[str, Any]],
    call_index: int,
    result_index: int,
) -> None:
    correlation_id = f"adjacent-record-{call_index:04d}"
    for index in (call_index, result_index):
        entries[index]["correlation_id"] = correlation_id
        entries[index]["correlation_source"] = "adjacency"


def _handle_unpaired_entry(
    entries: list[dict[str, Any]],
    index: int,
    state: dict[str, Any],
) -> None:
    pending = state["pending_calls"]
    record_type = entries[index]["record_type"]
    if record_type == "tool_call":
        pending.append(index)
        return
    if record_type == "tool_result" and len(pending) == 1:
        if state["previous_significant"] == pending[0]:
            _apply_adjacency_pair(entries, pending[0], index)
    pending.clear()


def _advance_adjacency(
    entries: list[dict[str, Any]],
    index: int,
    state: dict[str, Any],
) -> None:
    entry = entries[index]
    if entry["record_type"] in METADATA_TYPES:
        return
    if entry["correlation_source"] == "provider" or entry["call_id"]:
        state["pending_calls"].clear()
    else:
        _handle_unpaired_entry(entries, index, state)
    state["previous_significant"] = index


def _apply_adjacency_correlations(entries: list[dict[str, Any]]) -> None:
    state: dict[str, Any] = {"pending_calls": [], "previous_significant": None}
    for index in range(len(entries)):
        _advance_adjacency(entries, index, state)


def _normalized_records(
    entries: list[dict[str, Any]],
    provider: str,
    session: str,
) -> list[NormalizedRecord]:
    return [
        NormalizedRecord(
            id=f"record-{index:04d}",
            provider=provider,
            session=session,
            timestamp=str(entry["timestamp"]),
            role=str(entry["role"]),
            record_type=str(entry["record_type"]),
            tool_name=str(entry["tool_name"]),
            correlation_id=str(entry["correlation_id"]),
            correlation_source=str(entry["correlation_source"]),
            text=str(entry["text"]),
            source_index=int(entry["source_index"]),
        )
        for index, entry in enumerate(entries)
    ]


def normalize_records(path: Path, records: list[dict[str, Any]]) -> list[NormalizedRecord]:
    entries = _normalized_entries(records)
    _apply_provider_correlations(entries)
    _apply_adjacency_correlations(entries)
    return _normalized_records(entries, provider_from_path(path), session_id_from(path, records))
