#!/usr/bin/env python3
"""Publish one explicitly approved CodeStable feedback preview."""

from __future__ import annotations

import argparse
import json
import os
import re
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
    public_incident_kind_label,
    publication_approval_hash,
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


def public_body_private_reasons(
    text: str,
    private_tokens: set[str] | None = None,
) -> list[str]:
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
    for token in private_tokens or set():
        if token and re.search(
            rf"(?<![A-Za-z0-9_.-]){re.escape(token)}(?![A-Za-z0-9_.-])",
            text,
            flags=re.IGNORECASE,
        ):
            reasons.append("private-repository")
            break
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


def _read_public_context(path: Path) -> dict[str, object]:
    try:
        context = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"public context invalid: {exc}") from exc
    if not isinstance(context, dict) or context.get("privacy") != "public-preview":
        raise SystemExit("public context must be a public-preview object")
    return context


def _approved_review(context: dict[str, object]) -> dict[str, object]:
    review = context.get("privacy_review")
    if not isinstance(review, dict) or review.get("status") != "approved":
        raise SystemExit("public context has not been explicitly approved")
    return review


def _validate_review_binding(
    context: dict[str, object],
    review: dict[str, object],
) -> None:
    projection_hash = public_projection_hash(context)
    if context.get("projection_hash") != projection_hash:
        raise SystemExit("public context projection hash is invalid")
    if review.get("projection_hash") != projection_hash:
        raise SystemExit("privacy approval does not match the current projection")
    target_repo = str(review.get("target_repo") or "")
    approval_id = str(review.get("approval_id") or "")
    expected_hash = publication_approval_hash(projection_hash, target_repo, approval_id)
    if not target_repo or not approval_id or review.get("approval_hash") != expected_hash:
        raise SystemExit("privacy approval is missing or has invalid target binding")


def load_approved_context(path: Path) -> dict[str, object]:
    context = _read_public_context(path)
    _validate_review_binding(context, _approved_review(context))
    return context


def load_available_approval(
    path: Path,
    context: dict[str, object],
    target_repo: str,
) -> dict[str, object]:
    try:
        approval = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"一次性发布批准不可用：{exc}") from exc
    if not isinstance(approval, dict):
        raise SystemExit("一次性发布批准格式无效")
    review = context.get("privacy_review")
    if not isinstance(review, dict):
        raise SystemExit("公开上下文缺少隐私批准")
    expected = {
        "privacy": "local-private",
        "status": "available",
        "projection_hash": context.get("projection_hash"),
        "target_repo": target_repo,
        "approval_id": review.get("approval_id"),
        "approval_hash": review.get("approval_hash"),
    }
    if any(approval.get(key) != value for key, value in expected.items()):
        raise SystemExit("一次性发布批准与当前投影或目标仓库不匹配")
    if review.get("target_repo") != target_repo:
        raise SystemExit("隐私批准未授权发布到该目标仓库")
    expected_hash = publication_approval_hash(
        str(context.get("projection_hash") or ""),
        target_repo,
        str(review.get("approval_id") or ""),
    )
    if approval.get("approval_hash") != expected_hash:
        raise SystemExit("一次性发布批准哈希无效")
    return approval


def consume_approval(path: Path, approval: dict[str, object]) -> None:
    used_path = path.with_name(path.name + ".used")
    try:
        descriptor = os.open(used_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as exc:
        raise SystemExit("一次性发布批准已被使用") from exc
    try:
        os.write(descriptor, str(approval.get("approval_id") or "").encode("utf-8"))
    finally:
        os.close(descriptor)
    try:
        path.unlink()
    except OSError as exc:
        used_path.unlink(missing_ok=True)
        raise SystemExit(f"无法消费一次性发布批准：{exc}") from exc


def expected_title(context: dict[str, object]) -> str:
    incidents = context.get("incidents")
    if not isinstance(incidents, list) or len(incidents) != 1:
        raise SystemExit("approved context must contain exactly one incident")
    incident = incidents[0]
    if not isinstance(incident, dict):
        raise SystemExit("approved incident must be an object")
    target = str(incident.get("target_skill") or "未知")
    kind = public_incident_kind_label(incident.get("incident_kind"))
    return f"技能反馈：{target} {kind}"


def _publisher_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True, help="GitHub repo, e.g. owner/name")
    parser.add_argument("--title", required=True)
    parser.add_argument("--body-file", required=True)
    parser.add_argument("--public-context", required=True)
    parser.add_argument("--approval-file", required=True)
    parser.add_argument("--json-output")
    parser.add_argument("--confirm-public-preview", action="store_true")
    return parser


def _publish_paths(args: argparse.Namespace) -> tuple[Path, Path, Path]:
    body_file = Path(args.body_file).expanduser()
    if body_file.name != "github-issue.md" or not body_file.is_file():
        raise SystemExit("publish requires the generated github-issue.md")
    if not args.confirm_public_preview:
        raise SystemExit("public preview confirmation required")
    return (
        body_file,
        Path(args.public_context).expanduser(),
        Path(args.approval_file).expanduser(),
    )


def _validate_public_preview(
    args: argparse.Namespace,
    context: dict[str, object],
    body_file: Path,
) -> None:
    actual_body = body_file.read_text(encoding="utf-8")
    if actual_body != render_public_issue(context):
        raise SystemExit("issue body does not match the approved public projection")
    if args.title != expected_title(context):
        raise SystemExit("issue title does not match the approved public projection")
    repository_tokens = {args.repo, *args.repo.split("/", 1)}
    reasons = public_body_private_reasons(
        actual_body + "\n" + args.title,
        repository_tokens,
    )
    if reasons:
        raise SystemExit("public preview contains private content: " + ", ".join(reasons))


def _issue_create_command(args: argparse.Namespace, body_file: Path) -> list[str]:
    return [
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


def _creation_result(create: subprocess.CompletedProcess[str]) -> dict[str, object]:
    if create.returncode == 0:
        return {"status": "created", "url": create.stdout.strip()}
    ambiguous = is_network_error(create)
    return {
        "status": "unknown" if ambiguous else "failed",
        "reason": (
            "创建结果不明确；先人工检查 GitHub，再重新预览和批准"
            if ambiguous
            else "创建失败；再次尝试前必须重新预览和批准"
        ),
    }


def _publish_issue(
    command: list[str],
    approval_file: Path,
    approval: dict[str, object],
) -> dict[str, object]:
    gh = shutil.which("gh")
    if not gh:
        return {"status": "manual", "reason": "未找到 gh；安装后用同一发布器重试"}
    auth, proxy = run_read_only_with_proxy_retry([gh, "auth", "status"])
    if auth.returncode != 0:
        return {
            "status": "manual",
            "reason": "gh 认证失败；完成认证后用同一发布器重试",
            "proxy_used": proxy,
        }
    consume_approval(approval_file, approval)
    return _creation_result(run([gh, *command[1:]]))


def _emit_result(payload: dict[str, object], json_output: str | None) -> None:
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if json_output:
        output = Path(json_output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(text, encoding="utf-8")
    print(text, end="")


def main_with_args_for_test(argv: list[str] | None = None) -> int:
    args = _publisher_parser().parse_args(argv)
    body_file, context_file, approval_file = _publish_paths(args)
    context = load_approved_context(context_file)
    approval = load_available_approval(approval_file, context, args.repo)
    _validate_public_preview(args, context, body_file)
    result = _publish_issue(
        _issue_create_command(args, body_file),
        approval_file,
        approval,
    )
    _emit_result(result, args.json_output)
    return 0


def main() -> int:
    return main_with_args_for_test()


if __name__ == "__main__":
    raise SystemExit(main())
