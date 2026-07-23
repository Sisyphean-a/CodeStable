from __future__ import annotations

from dataclasses import dataclass


PUBLIC_INCIDENT_FIELDS = [
    "incident_kind",
    "target_skill",
    "expected_behavior",
    "actual_behavior",
    "impact",
    "proposed_fix",
]


@dataclass(frozen=True)
class Candidate:
    path: str
    provider: str
    session: str
    cwd: str
    mtime: float
    score: int


@dataclass(frozen=True)
class SessionMeta:
    session: str
    cwd: str


@dataclass
class NormalizedRecord:
    id: str
    provider: str
    session: str
    timestamp: str
    role: str
    record_type: str
    tool_name: str
    correlation_id: str
    correlation_source: str
    text: str
    source_index: int


@dataclass
class FeedbackIncident:
    id: str
    target_skill: str
    incident_kind: str
    observations: list[dict[str, object]]
    timeline: list[dict[str, object]]
    environment_context: dict[str, object]
    repo_context: dict[str, object]
    user_correction: dict[str, object]
    capture_cutoff: str
