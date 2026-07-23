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


def _assessment_from_incident(incident: dict[str, object]) -> dict[str, object]:
    observations = [
        item for item in incident.get("observations", []) if isinstance(item, dict)
    ]
    correction = (
        incident.get("user_correction")
        if isinstance(incident.get("user_correction"), dict)
        else {}
    )
    correction_text = str(correction.get("text") or "unknown")
    correction_ref = [str(correction.get("id"))] if correction.get("id") else []
    expected = (
        correction_text
        if correction_text != "unknown" and EXPECTED_PATTERN.search(correction_text)
        else "unknown"
    )
    actual_item = next(
        (item for item in reversed(observations) if item.get("role") == "assistant"),
        None,
    )
    actual = str(actual_item.get("text")) if actual_item else "unknown"
    actual_refs = (
        [str(actual_item.get("id"))]
        if actual_item and actual_item.get("id")
        else []
    )
    return {
        "expected_behavior": field(
            expected,
            "transcript" if expected != "unknown" else "unknown",
            correction_ref,
        ),
        "actual_behavior": field(
            actual,
            "transcript" if actual != "unknown" else "unknown",
            actual_refs,
        ),
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


def recompute_quality(triage: dict[str, Any]) -> dict[str, Any]:
    questions: list[str] = []
    if not triage.get("incident_id"):
        questions.append("select incident")
    if triage.get("target_skill") in (None, "", "unknown"):
        questions.append("identify target skill")

    observation_ids = {
        item for item in triage.get("observation_ids", []) if isinstance(item, str)
    }
    if not observation_ids:
        questions.append("identify supporting observations")

    assessment = (
        triage.get("assessment")
        if isinstance(triage.get("assessment"), dict)
        else {}
    )
    for key, prompt in (
        ("expected_behavior", "state expected behavior with valid observation refs"),
        ("actual_behavior", "state actual behavior with valid observation refs"),
    ):
        item = assessment.get(key)
        valid = _valid_assessment(item, observation_ids)
        has_value = isinstance(item, dict) and item.get("value") not in (
            None,
            "",
            "unknown",
        )
        has_refs = isinstance(item, dict) and bool(item.get("evidence_refs"))
        if not valid or not has_value or not has_refs:
            questions.append(prompt)

    cause_status = assessment.get("cause_status")
    cause_refs = assessment.get("cause_evidence_refs")
    cause_refs_valid = (
        isinstance(cause_refs, list)
        and bool(cause_refs)
        and all(isinstance(ref, str) and ref in observation_ids for ref in cause_refs)
    )
    if cause_status not in CAUSE_STATUS_VALUES:
        questions.append("确认根因状态")
    elif cause_status != "unclassified" and not cause_refs_valid:
        questions.append("为已判断根因提供有效观察证据")

    triage["quality"] = {
        "triage_ready": not questions,
        "next_questions": questions,
    }
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


def merge_existing_triage(
    generated: dict[str, Any],
    existing: dict[str, Any] | None,
) -> dict[str, Any]:
    if existing is None:
        return generated
    if (
        existing.get("schema_version") != 3
        or existing.get("privacy") != "local-private"
    ):
        raise ValueError("existing triage must be schema v3 local-private")

    same_incident = bool(generated.get("incident_fingerprint")) and (
        generated.get("incident_fingerprint")
        == existing.get("incident_fingerprint")
    )
    if not same_incident:
        return generated

    merged = copy.deepcopy(generated)
    observation_ids = set(merged.get("observation_ids", []))
    existing_assessment = (
        existing.get("assessment")
        if isinstance(existing.get("assessment"), dict)
        else {}
    )
    for key in (
        "expected_behavior",
        "actual_behavior",
        "impact",
        "proposed_fix",
    ):
        candidate = existing_assessment.get(key)
        if (
            _valid_assessment(candidate, observation_ids)
            and isinstance(candidate, dict)
            and candidate.get("source") == "user"
        ):
            merged["assessment"][key] = copy.deepcopy(candidate)
    cause_status = existing_assessment.get("cause_status")
    cause_refs = existing_assessment.get("cause_evidence_refs")
    cause_refs_valid = (
        isinstance(cause_refs, list)
        and bool(cause_refs)
        and all(isinstance(ref, str) and ref in observation_ids for ref in cause_refs)
    )
    if cause_status == "unclassified":
        merged["assessment"]["cause_status"] = "unclassified"
        merged["assessment"]["cause_evidence_refs"] = []
    elif cause_status in CAUSE_STATUS_VALUES and cause_refs_valid:
        merged["assessment"]["cause_status"] = cause_status
        merged["assessment"]["cause_evidence_refs"] = copy.deepcopy(cause_refs)

    privacy = existing.get("privacy_review")
    if isinstance(privacy, dict):
        merged["privacy_review"] = {
            "status": str(privacy.get("status") or "pending"),
            "projection_hash": str(privacy.get("projection_hash") or ""),
            "notes": str(privacy.get("notes") or ""),
        }
    return recompute_quality(merged)
