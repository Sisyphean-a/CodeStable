from __future__ import annotations

import copy
import hashlib
import json
import re
from typing import Any


ASSESSMENT_SOURCES = {"user", "transcript", "inferred", "unknown"}
CONFIDENCE_VALUES = {"low", "medium", "high"}
CAUSE_STATUS_VALUES = {"unclassified", "suspected", "confirmed"}
EXPECTED_PATTERN = re.compile(
    r"(应该|应当|本应|必须|需要|正确.{0,8}(?:是|为)|should|expected|must|instead)",
    re.IGNORECASE,
)


def field(
    value: str,
    source: str,
    refs: list[str],
    *,
    confidence: str | None = None,
) -> dict[str, object]:
    out: dict[str, object] = {
        "value": value,
        "source": source,
        "evidence_refs": refs,
    }
    if source == "inferred":
        out["confidence"] = confidence or "medium"
    return out


def empty_triage() -> dict[str, Any]:
    return {
        "schema_version": 3,
        "privacy": "local-private",
        "incident_id": "",
        "incident_fingerprint": "",
        "incident_candidates": [],
        "observation_ids": [],
        "trigger_cutoff": "unknown",
        "target_skill": "unknown",
        "incident_kind": "unknown",
        "assessment": {
            "expected_behavior": field("unknown", "unknown", []),
            "actual_behavior": field("unknown", "unknown", []),
            "impact": field("unknown", "unknown", []),
            "proposed_fix": field("unknown", "unknown", []),
            "cause_status": "unclassified",
            "cause_evidence_refs": [],
        },
        "privacy_review": {
            "status": "pending",
            "projection_hash": "",
            "target_repo": "",
            "approval_id": "",
            "approval_hash": "",
            "notes": "",
        },
        "quality": {"triage_ready": False, "next_questions": []},
    }


def incident_fingerprint(incident: dict[str, object]) -> str:
    stable = {
        "target_skill": incident.get("target_skill"),
        "incident_kind": incident.get("incident_kind"),
        "capture_cutoff": incident.get("capture_cutoff"),
        "observations": [
            {
                "role": item.get("role"),
                "record_type": item.get("record_type"),
                "text": item.get("text"),
            }
            for item in incident.get("observations", [])
            if isinstance(item, dict)
        ],
    }
    raw = json.dumps(stable, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _referenced_text(item: dict[str, object] | None) -> tuple[str, list[str]]:
    if not item:
        return "unknown", []
    text = str(item.get("text") or "unknown")
    refs = [str(item["id"])] if item.get("id") else []
    return text, refs


def _expected_assessment(incident: dict[str, object]) -> dict[str, object]:
    correction = incident.get("user_correction")
    item = correction if isinstance(correction, dict) else None
    text, refs = _referenced_text(item)
    expected = text if text != "unknown" and EXPECTED_PATTERN.search(text) else "unknown"
    source = "transcript" if expected != "unknown" else "unknown"
    return field(expected, source, refs)


def _actual_assessment(incident: dict[str, object]) -> dict[str, object]:
    observations = [
        item for item in incident.get("observations", []) if isinstance(item, dict)
    ]
    item = next(
        (candidate for candidate in reversed(observations) if candidate.get("role") == "assistant"),
        None,
    )
    actual, refs = _referenced_text(item)
    source = "transcript" if actual != "unknown" else "unknown"
    return field(actual, source, refs)


def _assessment_from_incident(incident: dict[str, object]) -> dict[str, object]:
    return {
        "expected_behavior": _expected_assessment(incident),
        "actual_behavior": _actual_assessment(incident),
        "impact": field("unknown", "unknown", []),
        "proposed_fix": field("unknown", "unknown", []),
        "cause_status": "unclassified",
        "cause_evidence_refs": [],
    }


def _valid_assessment(value: object, observation_ids: set[str]) -> bool:
    if not isinstance(value, dict):
        return False
    source = value.get("source")
    refs = value.get("evidence_refs")
    if source not in ASSESSMENT_SOURCES or not isinstance(refs, list):
        return False
    if not all(isinstance(ref, str) and ref in observation_ids for ref in refs):
        return False
    if source == "inferred" and value.get("confidence") not in CONFIDENCE_VALUES:
        return False
    return True


def _observation_ids(triage: dict[str, Any]) -> set[str]:
    return {
        item for item in triage.get("observation_ids", []) if isinstance(item, str)
    }


def _base_questions(triage: dict[str, Any], observation_ids: set[str]) -> list[str]:
    questions: list[str] = []
    if not triage.get("incident_id"):
        questions.append("选择一个事件")
    if triage.get("target_skill") in (None, "", "unknown"):
        questions.append("确认目标技能")
    if not observation_ids:
        questions.append("确认支撑结论的观察记录")
    return questions


def _assessment_item_complete(value: object, observation_ids: set[str]) -> bool:
    if not _valid_assessment(value, observation_ids) or not isinstance(value, dict):
        return False
    return value.get("value") not in (None, "", "unknown") and bool(value.get("evidence_refs"))


def _assessment_questions(
    assessment: dict[str, Any],
    observation_ids: set[str],
) -> list[str]:
    prompts = (
        ("expected_behavior", "说明预期行为并引用有效观察记录"),
        ("actual_behavior", "说明实际行为并引用有效观察记录"),
    )
    return [
        prompt
        for key, prompt in prompts
        if not _assessment_item_complete(assessment.get(key), observation_ids)
    ]


def _valid_cause_refs(value: object, observation_ids: set[str]) -> bool:
    return (
        isinstance(value, list)
        and bool(value)
        and all(isinstance(ref, str) and ref in observation_ids for ref in value)
    )


def _cause_questions(
    assessment: dict[str, Any],
    observation_ids: set[str],
) -> list[str]:
    status = assessment.get("cause_status")
    if status not in CAUSE_STATUS_VALUES:
        return ["确认根因状态"]
    refs_valid = _valid_cause_refs(assessment.get("cause_evidence_refs"), observation_ids)
    if status != "unclassified" and not refs_valid:
        return ["为已判断根因提供有效观察证据"]
    return []


def recompute_quality(triage: dict[str, Any]) -> dict[str, Any]:
    observation_ids = _observation_ids(triage)
    assessment = triage.get("assessment")
    normalized = assessment if isinstance(assessment, dict) else {}
    questions = _base_questions(triage, observation_ids)
    questions.extend(_assessment_questions(normalized, observation_ids))
    questions.extend(_cause_questions(normalized, observation_ids))
    triage["quality"] = {"triage_ready": not questions, "next_questions": questions}
    return triage


def build_triage(
    incidents: list[dict[str, object]],
    primary_incident: dict[str, object] | None,
) -> dict[str, Any]:
    triage = empty_triage()
    triage["incident_candidates"] = [str(item.get("id")) for item in incidents]
    if primary_incident is None:
        return recompute_quality(triage)

    observations = [
        item
        for item in primary_incident.get("observations", [])
        if isinstance(item, dict)
    ]
    triage.update(
        {
            "incident_id": str(primary_incident.get("id") or ""),
            "incident_fingerprint": incident_fingerprint(primary_incident),
            "observation_ids": [
                str(item.get("id")) for item in observations if item.get("id")
            ],
            "trigger_cutoff": str(
                primary_incident.get("capture_cutoff") or "unknown"
            ),
            "target_skill": str(
                primary_incident.get("target_skill") or "unknown"
            ),
            "incident_kind": str(
                primary_incident.get("incident_kind") or "unknown"
            ),
            "assessment": _assessment_from_incident(primary_incident),
        }
    )
    return recompute_quality(triage)


def _validate_existing_triage(existing: dict[str, Any]) -> None:
    if existing.get("schema_version") != 3 or existing.get("privacy") != "local-private":
        raise ValueError("existing triage must be schema v3 local-private")


def _same_incident(generated: dict[str, Any], existing: dict[str, Any]) -> bool:
    fingerprint = generated.get("incident_fingerprint")
    return bool(fingerprint) and fingerprint == existing.get("incident_fingerprint")


def _merge_user_assessments(
    merged: dict[str, Any],
    existing_assessment: dict[str, Any],
    observation_ids: set[str],
) -> None:
    keys = ("expected_behavior", "actual_behavior", "impact", "proposed_fix")
    for key in keys:
        candidate = existing_assessment.get(key)
        if not isinstance(candidate, dict) or candidate.get("source") != "user":
            continue
        if _valid_assessment(candidate, observation_ids):
            merged["assessment"][key] = copy.deepcopy(candidate)


def _merge_cause(
    merged: dict[str, Any],
    existing_assessment: dict[str, Any],
    observation_ids: set[str],
) -> None:
    status = existing_assessment.get("cause_status")
    refs = existing_assessment.get("cause_evidence_refs")
    if status == "unclassified":
        merged["assessment"]["cause_status"] = "unclassified"
        merged["assessment"]["cause_evidence_refs"] = []
        return
    if status not in CAUSE_STATUS_VALUES or not _valid_cause_refs(refs, observation_ids):
        return
    merged["assessment"]["cause_status"] = status
    merged["assessment"]["cause_evidence_refs"] = copy.deepcopy(refs)


def merge_existing_triage(
    generated: dict[str, Any],
    existing: dict[str, Any] | None,
) -> dict[str, Any]:
    if existing is None:
        return generated
    _validate_existing_triage(existing)
    if not _same_incident(generated, existing):
        return generated
    merged = copy.deepcopy(generated)
    observation_ids = _observation_ids(merged)
    assessment = existing.get("assessment")
    existing_assessment = assessment if isinstance(assessment, dict) else {}
    _merge_user_assessments(merged, existing_assessment, observation_ids)
    _merge_cause(merged, existing_assessment, observation_ids)
    return recompute_quality(merged)
