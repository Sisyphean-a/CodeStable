from __future__ import annotations

import copy
import hashlib
import json
import re
from typing import Any


ASSESSMENT_SOURCES = {"user", "transcript", "inferred", "unknown"}
EXPECTED_PATTERN = re.compile(r"(应该|应当|本应|必须|需要|正确.{0,8}(?:是|为)|should|expected|must|instead)", re.IGNORECASE)


def field(value: str, source: str, refs: list[str], confidence: str | None = None) -> dict[str, object]:
    out: dict[str, object] = {"value": value, "source": source, "evidence_refs": refs}
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
        },
        "privacy_review": {"status": "pending", "notes": ""},
        "quality": {"triage_ready": False, "next_questions": []},
    }


def incident_fingerprint(incident: dict[str, object]) -> str:
    stable = {
        "target_skill": incident.get("target_skill"),
        "incident_kind": incident.get("incident_kind"),
        "capture_cutoff": incident.get("capture_cutoff"),
        "observations": [
            {"role": item.get("role"), "record_type": item.get("record_type"), "text": item.get("text")}
            for item in incident.get("observations", [])
            if isinstance(item, dict)
        ],
    }
    raw = json.dumps(stable, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _assessment_from_incident(incident: dict[str, object]) -> dict[str, object]:
    observations = [item for item in incident.get("observations", []) if isinstance(item, dict)]
    correction = incident.get("user_correction") if isinstance(incident.get("user_correction"), dict) else {}
    correction_text = str(correction.get("text") or "unknown")
    correction_ref = [str(correction.get("id"))] if correction.get("id") else []
    expected = correction_text if correction_text != "unknown" and EXPECTED_PATTERN.search(correction_text) else "unknown"
    actual_item = next((item for item in reversed(observations) if item.get("role") == "assistant"), None)
    actual = str(actual_item.get("text")) if actual_item else "unknown"
    actual_refs = [str(actual_item.get("id"))] if actual_item and actual_item.get("id") else []
    return {
        "expected_behavior": field(expected, "transcript" if expected != "unknown" else "unknown", correction_ref),
        "actual_behavior": field(actual, "transcript" if actual != "unknown" else "unknown", actual_refs),
        "impact": field("unknown", "unknown", []),
        "proposed_fix": field("unknown", "unknown", []),
        "cause_status": "unclassified",
    }


def recompute_quality(triage: dict[str, Any]) -> dict[str, Any]:
    questions: list[str] = []
    if not triage.get("incident_id"):
        questions.append("select incident")
    if triage.get("target_skill") in (None, "", "unknown"):
        questions.append("identify target skill")
    assessment = triage.get("assessment") if isinstance(triage.get("assessment"), dict) else {}
    for key, prompt in (
        ("expected_behavior", "state expected behavior"),
        ("actual_behavior", "state actual behavior"),
    ):
        item = assessment.get(key) if isinstance(assessment.get(key), dict) else {}
        if item.get("value") in (None, "", "unknown") or not item.get("evidence_refs"):
            questions.append(prompt)
    if not triage.get("observation_ids"):
        questions.append("identify supporting observations")
    triage["quality"] = {"triage_ready": not questions, "next_questions": questions}
    return triage


def build_triage(
    incidents: list[dict[str, object]], primary_incident: dict[str, object] | None
) -> dict[str, Any]:
    triage = empty_triage()
    triage["incident_candidates"] = [str(item.get("id")) for item in incidents]
    if primary_incident is None:
        return recompute_quality(triage)
    observations = [item for item in primary_incident.get("observations", []) if isinstance(item, dict)]
    triage.update(
        {
            "incident_id": str(primary_incident.get("id") or ""),
            "incident_fingerprint": incident_fingerprint(primary_incident),
            "observation_ids": [str(item.get("id")) for item in observations if item.get("id")],
            "trigger_cutoff": str(primary_incident.get("capture_cutoff") or "unknown"),
            "target_skill": str(primary_incident.get("target_skill") or "unknown"),
            "incident_kind": str(primary_incident.get("incident_kind") or "unknown"),
            "assessment": _assessment_from_incident(primary_incident),
        }
    )
    return recompute_quality(triage)


def _valid_assessment(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    source = value.get("source")
    return source in ASSESSMENT_SOURCES and isinstance(value.get("evidence_refs"), list)


def merge_existing_triage(generated: dict[str, Any], existing: dict[str, Any] | None) -> dict[str, Any]:
    if existing is None:
        return generated
    if existing.get("schema_version") != 3 or existing.get("privacy") != "local-private":
        raise ValueError("existing triage must be schema v3 local-private")
    same_incident = (
        generated.get("incident_fingerprint")
        and generated.get("incident_fingerprint") == existing.get("incident_fingerprint")
    )
    if not same_incident:
        return generated
    merged = copy.deepcopy(generated)
    existing_assessment = existing.get("assessment") if isinstance(existing.get("assessment"), dict) else {}
    for key in ("expected_behavior", "actual_behavior", "impact", "proposed_fix"):
        candidate = existing_assessment.get(key)
        if _valid_assessment(candidate) and candidate.get("source") == "user":
            merged["assessment"][key] = copy.deepcopy(candidate)
    if existing_assessment.get("cause_status"):
        merged["assessment"]["cause_status"] = existing_assessment["cause_status"]
    privacy = existing.get("privacy_review")
    if isinstance(privacy, dict):
        merged["privacy_review"] = copy.deepcopy(privacy)
    return recompute_quality(merged)
