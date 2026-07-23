from __future__ import annotations

import re
from dataclasses import asdict
from pathlib import Path
from typing import Any

from feedback_models import FeedbackIncident, NormalizedRecord, PUBLIC_INCIDENT_FIELDS
from feedback_privacy import public_redact
from feedback_repo_context import build_repo_context, environment_context
from feedback_transcripts import normalize_records, read_transcript_snapshot


CS_PATTERN = re.compile(r"(?:\b(?:cs-[a-z0-9-]+|codestable)\b|\.codestable\b|/goal\b)", re.IGNORECASE)
FAILURE_PATTERN = re.compile(
    r"(failed|failure|error|exception|traceback|timeout|timed out|permission|denied|not found|"
    r"no such file|tool call|apply_patch|file read|read failed|mcp|gh issue|git clone|early EOF)",
    re.IGNORECASE,
)
USER_CORRECTION_PATTERN = re.compile(
    r"(不对|不是|应该|应当|需要|必须|你没有|你刚才|绕|错|没有用|没用|wrong|should have|"
    r"you didn't|not what|instead)",
    re.IGNORECASE,
)
INSTALL_PATTERN = re.compile(r"(plugin|marketplace|install|update|cache|version|codex|claude)", re.IGNORECASE)
FEEDBACK_TOKEN_STOPWORDS = {
    "agent", "call", "current", "error", "failed", "failure", "file", "read",
    "rule", "session", "should", "tool", "unclear",
}
INCIDENT_KIND_PRIORITY = [
    "privacy-reporting",
    "wrong-route",
    "unnecessary-detour",
    "tool-failure",
    "install-version",
    "unclear-rule",
]


def feedback_tokens(feedback: str) -> list[str]:
    tokens: list[str] = []
    for token in re.findall(r"[A-Za-z0-9_-]{4,}", feedback):
        normalized = token.lower()
        if normalized in FEEDBACK_TOKEN_STOPWORDS:
            continue
        if normalized.startswith("cs-") or "-" in normalized or len(normalized) >= 6:
            tokens.append(token)
    return tokens


def score_text(text: str, feedback: str) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    if CS_PATTERN.search(text):
        score += 2
        reasons.append("codestable")
    if FAILURE_PATTERN.search(text):
        score += 3
        reasons.append("failure")
    if USER_CORRECTION_PATTERN.search(text):
        score += 3
        reasons.append("user-correction")
    if any(token.lower() in text.lower() for token in feedback_tokens(feedback)):
        score += 1
        reasons.append("feedback-token")
    return score, reasons


def match_types_for(text: str) -> list[str]:
    matches: list[str] = []
    if FAILURE_PATTERN.search(text):
        matches.append("tool-failure")
    if USER_CORRECTION_PATTERN.search(text):
        matches.append("user-correction")
    if CS_PATTERN.search(text):
        matches.append("skill-reference")
    if INSTALL_PATTERN.search(text):
        matches.append("install-distribution")
    return matches


def is_relevant_event(match_types: list[str], reasons: list[str]) -> bool:
    if set(match_types) & {"skill-reference", "user-correction", "install-distribution"}:
        return True
    return "tool-failure" in match_types and "feedback-token" in reasons


def incident_kind_for(match_types: list[str], text: str) -> str:
    if re.search(r"(privacy|隐私|上传|public preview|reporting)", text, re.IGNORECASE):
        return "privacy-reporting"
    if re.search(r"(绕路|多余|unnecessary|detour)", text, re.IGNORECASE):
        return "unnecessary-detour"
    if "tool-failure" in match_types:
        return "tool-failure"
    if "install-distribution" in match_types:
        return "install-version"
    if "user-correction" in match_types:
        if re.search(r"(规则|没讲清|unclear|should have|应该|没有用|没用)", text, re.IGNORECASE):
            return "unclear-rule"
        return "wrong-route"
    return "unknown"


def skill_reference_from(text: str) -> str:
    match = re.search(r"\b(cs-[a-z0-9-]+)", text, re.IGNORECASE)
    return match.group(1).lower() if match else "unknown"


def _trigger_cutoff(records: list[NormalizedRecord]) -> int | None:
    for index in range(len(records) - 1, -1, -1):
        if records[index].role == "user":
            return index
    return None


def public_incident(incident: dict[str, object], triage: dict[str, object]) -> dict[str, str]:
    assessment = triage.get("assessment", {}) if isinstance(triage.get("assessment"), dict) else {}
    repo_context = incident.get("repo_context") if isinstance(incident.get("repo_context"), dict) else {}
    private_tokens = {
        str(token)
        for token in repo_context.get("private_tokens", [])
        if isinstance(token, str)
    }

    def redact_public(text: object) -> str:
        return public_redact(str(text or "unknown"), private_tokens=private_tokens)

    def value(name: str) -> str:
        item = assessment.get(name, {})
        if isinstance(item, dict):
            return redact_public(item.get("value"))
        return "unknown"

    projected = {
        "incident_kind": redact_public(incident.get("incident_kind")),
        "target_skill": redact_public(incident.get("target_skill")),
        "expected_behavior": value("expected_behavior"),
        "actual_behavior": value("actual_behavior"),
        "impact": value("impact"),
        "proposed_fix": value("proposed_fix"),
    }
    return {field: projected[field] for field in PUBLIC_INCIDENT_FIELDS}


def _incident_windows(records: list[NormalizedRecord], cutoff: int | None) -> list[list[NormalizedRecord]]:
    eligible = records[: cutoff + 1] if cutoff is not None else records
    if cutoff is None:
        return [eligible] if eligible else []
    windows: list[list[NormalizedRecord]] = []
    start = 0
    for index, record in enumerate(eligible):
        if record.role == "user":
            windows.append(eligible[start : index + 1])
            start = index + 1
    return windows


def _merge_correlated_windows(windows: list[list[NormalizedRecord]]) -> list[list[NormalizedRecord]]:
    merged: list[list[NormalizedRecord]] = []
    for window in windows:
        correlations = {record.correlation_id for record in window if record.correlation_id}
        matches = [
            index for index, existing in enumerate(merged)
            if correlations & {record.correlation_id for record in existing if record.correlation_id}
        ]
        if not matches:
            merged.append(window)
            continue
        insert_at = matches[0]
        combined = [*window]
        for index in reversed(matches):
            combined.extend(merged.pop(index))
        unique = {(record.provider, record.session, record.id): record for record in combined}
        merged.insert(insert_at, sorted(unique.values(), key=lambda record: record.source_index))
    return merged


def _incident_kind(records: list[NormalizedRecord]) -> str:
    kinds = {incident_kind_for(match_types_for(record.text), record.text) for record in records}
    return next((kind for kind in INCIDENT_KIND_PRIORITY if kind in kinds), "unknown")


def _incident_from_window(
    window: list[NormalizedRecord],
    feedback: str,
    incident_number: int,
    observation_start: int,
    environment: dict[str, object],
    repo_context: dict[str, object],
) -> tuple[dict[str, object], int] | None:
    meaningful = [record for record in window if record.record_type != "session_meta"]
    relevant: list[NormalizedRecord] = []
    for record in meaningful:
        _score, reasons = score_text(record.text, feedback)
        match_types = match_types_for(record.text)
        if is_relevant_event(match_types, reasons):
            relevant.append(record)
    if not relevant:
        return None

    corrections = [
        record for record in meaningful
        if record.role == "user" and USER_CORRECTION_PATTERN.search(record.text)
    ]
    target_skill = "unknown"
    for record in [*reversed(corrections), *relevant]:
        target_skill = skill_reference_from(record.text)
        if target_skill != "unknown":
            break

    observations = [
        {
            "id": f"obs-{observation_start + offset:04d}",
            "record_id": record.id,
            "source_index": record.source_index,
            "role": record.role,
            "record_type": record.record_type,
            "text": record.text,
        }
        for offset, record in enumerate(meaningful)
    ]
    obs_by_record = {str(item["record_id"]): str(item["id"]) for item in observations}
    timeline = [
        {
            "record_id": record.id,
            "role": record.role,
            "record_type": record.record_type,
            "tool_name": record.tool_name,
            "correlation_id": record.correlation_id,
            "correlation_source": record.correlation_source,
            "observation_id": obs_by_record.get(record.id, ""),
        }
        for record in meaningful
    ]
    correction_ids = {record.id for record in corrections}
    user_correction = next(
        (item for item in reversed(observations) if item["record_id"] in correction_ids),
        {},
    )
    user_records = [record for record in meaningful if record.role == "user"]
    incident = FeedbackIncident(
        id=f"incident-{incident_number:02d}",
        target_skill=target_skill,
        incident_kind=_incident_kind(relevant),
        observations=observations,
        timeline=timeline,
        environment_context=environment,
        repo_context=repo_context,
        user_correction=user_correction,
        capture_cutoff=user_records[-1].id if user_records else "unknown",
    )
    return asdict(incident), observation_start + len(observations)


def build_incident_payload(
    paths: list[Path],
    feedback: str,
    cwd: str | None,
    records_by_path: dict[Path, list[dict[str, Any]]] | None = None,
    captures_by_path: dict[Path, dict[str, Any]] | None = None,
) -> tuple[list[dict[str, object]], dict[str, object] | None]:
    incidents: list[dict[str, object]] = []
    primary_candidates: list[dict[str, object]] = []
    observation_number = 1
    repo_context = build_repo_context(cwd)
    for path in paths:
        if records_by_path is not None and path in records_by_path:
            raw_records = records_by_path[path]
            capture = (captures_by_path or {}).get(path, {})
        else:
            raw_records, capture = read_transcript_snapshot(path)
        records = normalize_records(path, raw_records)
        cutoff = _trigger_cutoff(records)
        trigger_id = records[cutoff].id if cutoff is not None else None
        environment = environment_context(path, raw_records, capture)
        for window in _merge_correlated_windows(_incident_windows(records, cutoff)):
            built = _incident_from_window(
                window, feedback, len(incidents) + 1, observation_number, environment, repo_context
            )
            if built is None:
                continue
            incident, observation_number = built
            incidents.append(incident)
            if trigger_id and any(
                isinstance(item, dict) and item.get("record_id") == trigger_id
                for item in incident.get("timeline", [])
            ):
                primary_candidates.append(incident)
    primary = primary_candidates[0] if len(primary_candidates) == 1 else None
    return incidents, primary
