#!/usr/bin/env python3
"""Publish one explicitly approved CodeStable feedback preview."""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import shutil
import socket
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from feedback_privacy import (  # noqa: E402
    CODE_FILENAME_PATTERN,
    CREDENTIAL_REDACTIONS,
    EMAIL_PATTERN,
    ENV_NAME_PATTERN,
    ENV_PATTERN,
    PATH_PATTERN,
    RELATIVE_CODE_PATH_PATTERN,
    REMOTE_PATTERN,
    URL_PATTERN,
    contains_inline_json,
    contains_secret_assignment,
    public_projection_hash,
    render_public_issue,
)


NETWORK_ERROR_PATTERN = (
    "could not resolve host",
    "failed to connect",
    "connection refused",
    "connection reset",
    "connection timed out",
    "tls handshake timeout",
    "i/o timeout",
    "proxyconnect",
    "early eof",
)


def public_body_private_reasons(text: str) -> list[str]:
    checks = {
        "absolute-path": PATH_PATTERN,
        "relative-code-path": RELATIVE_CODE_PATH_PATTERN,
        "code-filename": CODE_FILENAME_PATTERN,
        "remote": REMOTE_PATTERN,
        "url": URL_PATTERN,
        "email": EMAIL_PATTERN,
        "environment": ENV_PATTERN,
        "environment-name": ENV_NAME_PATTERN,
    }
    reasons = [name for name, pattern in checks.items() if pattern.search(text)]
    if contains_secret_assignment(text) or any(
        pattern.search(text) for pattern, _replacement in CREDENTIAL_REDACTIONS
    ):
        reasons.append("secret")
    if contains_inline_json(text):
        reasons.append("raw-json")
    if "```" in text:
        reasons.append("code-block")
    if re.search(r"(?:sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9_]{20,})", text):
        reasons.append("secret-token")
    return reasons


def run(
    command: list[str],
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def shell_join(command: list[str]) -> str:
    return " ".join(shlex.quote(part) for part in command)


def is_network_error(result: subprocess.CompletedProcess[str]) -> bool:
    text = f"{result.stdout}\n{result.stderr}".lower()
    return any(pattern in text for pattern in NETWORK_ERROR_PATTERN)


def proxy_reachable(proxy_url: str) -> bool:
    parsed = urlparse(proxy_url)
    if not parsed.hostname or not parsed.port:
        return False
    try:
        with socket.create_connection((parsed.hostname, parsed.port), timeout=0.4):
            return True
    except OSError:
        return False


def proxy_label(proxy_url: str) -> str:
    parsed = urlparse(proxy_url)
    if not parsed.hostname:
        return "configured"
    return f"{parsed.hostname}:{parsed.port}" if parsed.port else parsed.hostname


def proxy_env_candidates() -> list[tuple[dict[str, str], str]]:
    proxies: list[str] = []
    for key in (
        "HTTPS_PROXY",
        "https_proxy",
        "HTTP_PROXY",
        "http_proxy",
        "ALL_PROXY",
        "all_proxy",
    ):
        value = os.environ.get(key)
        if value and value not in proxies:
            proxies.append(value)
    for value in (
        "http://127.0.0.1:7890",
        "http://localhost:7890",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:1087",
    ):
        if value not in proxies and proxy_reachable(value):
            proxies.append(value)

    candidates: list[tuple[dict[str, str], str]] = []
    for proxy in proxies:
        env = os.environ.copy()
        env.update(
            {
                "HTTPS_PROXY": proxy,
                "HTTP_PROXY": proxy,
                "https_proxy": proxy,
                "http_proxy": proxy,
            }
        )
        candidates.append((env, proxy_label(proxy)))
    return candidates


def run_read_only_with_proxy_retry(
    command: list[str],
) -> tuple[subprocess.CompletedProcess[str], str | None]:
    result = run(command)
    if result.returncode == 0 or not is_network_error(result):
        return result, None
    for env, label in proxy_env_candidates():
        retry = run(command, env=env)
        if retry.returncode == 0 or not is_network_error(retry):
            return retry, label
        result = retry
    return result, None


def load_approved_context(path: Path) -> dict[str, object]:
    try:
        context = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"public context invalid: {exc}") from exc
    if not isinstance(context, dict) or context.get("privacy") != "public-preview":
        raise SystemExit("public context must be a public-preview object")
    review = context.get("privacy_review")
    if not isinstance(review, dict) or review.get("status") != "approved":
        raise SystemExit("public context has not been explicitly approved")
    projection_hash = public_projection_hash(context)
    if context.get("projection_hash") != projection_hash:
        raise SystemExit("public context projection hash is invalid")
    if review.get("projection_hash") != projection_hash:
        raise SystemExit("privacy approval does not match the current projection")
    return context


def expected_title(context: dict[str, object]) -> str:
    incidents = context.get("incidents")
    if not isinstance(incidents, list) or len(incidents) != 1:
        raise SystemExit("approved context must contain exactly one incident")
    incident = incidents[0]
    if not isinstance(incident, dict):
        raise SystemExit("approved incident must be an object")
    target = str(incident.get("target_skill") or "unknown")
    kind = str(incident.get("incident_kind") or "unknown")
    return f"CodeStable feedback: {target} {kind}"


def main_with_args_for_test(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True, help="GitHub repo, e.g. owner/name")
    parser.add_argument("--title", required=True)
    parser.add_argument("--body-file", required=True)
    parser.add_argument("--public-context", required=True)
    parser.add_argument("--json-output")
    parser.add_argument("--confirm-public-preview", action="store_true")
    args = parser.parse_args(argv)

    body_file = Path(args.body_file).expanduser()
    context_file = Path(args.public_context).expanduser()
    if body_file.name != "github-issue.md" or not body_file.is_file():
        raise SystemExit("publish requires the generated github-issue.md")
    if not args.confirm_public_preview:
        raise SystemExit("public preview confirmation required")

    context = load_approved_context(context_file)
    expected_body = render_public_issue(context)
    actual_body = body_file.read_text(encoding="utf-8")
    if actual_body != expected_body:
        raise SystemExit("issue body does not match the approved public projection")
    if args.title != expected_title(context):
        raise SystemExit("issue title does not match the approved public projection")

    reasons = public_body_private_reasons(actual_body + "\n" + args.title)
    if reasons:
        raise SystemExit("public preview contains private content: " + ", ".join(reasons))

    gh = shutil.which("gh")
    command = [
        "gh",
        "issue",
        "create",
        "--repo",
        args.repo,
        "--title",
        args.title,
        "--body-file",
        str(body_file),
    ]
    result_payload: dict[str, object]
    if not gh:
        result_payload = {
            "status": "manual",
            "reason": "gh not found",
            "command": shell_join(command),
        }
    else:
        auth, auth_proxy = run_read_only_with_proxy_retry([gh, "auth", "status"])
        if auth.returncode != 0:
            result_payload = {
                "status": "manual",
                "reason": "gh auth status failed",
                "command": shell_join(command),
                "proxy_used": auth_proxy,
            }
        else:
            # Creation is non-idempotent: never retry after an ambiguous response.
            create = run([gh, *command[1:]])
            if create.returncode == 0:
                result_payload = {
                    "status": "created",
                    "url": create.stdout.strip(),
                }
            else:
                result_payload = {
                    "status": "unknown" if is_network_error(create) else "manual",
                    "reason": (
                        "gh issue create response was ambiguous; verify GitHub before retrying"
                        if is_network_error(create)
                        else "gh issue create failed"
                    ),
                    "command": shell_join(command),
                }

    text = json.dumps(result_payload, ensure_ascii=False, indent=2) + "\n"
    if args.json_output:
        output = Path(args.json_output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(text, encoding="utf-8")
    print(text, end="")
    return 0


def main() -> int:
    return main_with_args_for_test()


if __name__ == "__main__":
    raise SystemExit(main())
