from __future__ import annotations

import hashlib
import json
import re


PATH_SEGMENT_PATTERN = (
    r"[^\s`'\"<>/\\,;:!?()\[\]{}，。；：！？、（）【】《》〈〉「」『』"
    r"〔〕〖〗〘〙〚〛“”‘’…—·～]+"
)
PATH_PATTERN = re.compile(
    rf"(?<![A-Za-z0-9_.~-])(?:~[/\\]{PATH_SEGMENT_PATTERN}(?:[/\\]{PATH_SEGMENT_PATTERN})*"
    rf"|/{PATH_SEGMENT_PATTERN}(?:/{PATH_SEGMENT_PATTERN})*"
    rf"|[A-Za-z]:\\{PATH_SEGMENT_PATTERN}(?:\\{PATH_SEGMENT_PATTERN})*"
    rf"|\\\\{PATH_SEGMENT_PATTERN}\\{PATH_SEGMENT_PATTERN}(?:\\{PATH_SEGMENT_PATTERN})*)"
)
PATH_SPACED_CONTINUATION_PATTERN = re.compile(
    rf"[ \t]+({PATH_SEGMENT_PATTERN})(?:[/\\]{PATH_SEGMENT_PATTERN})+"
)
PATH_SPACED_WORD_PATTERN = re.compile(rf"[ \t]+({PATH_SEGMENT_PATTERN})")
PATH_EXTENSION_PATTERN = re.compile(r"[\w+-]+")
RELATIVE_CODE_PATH_PATTERN = re.compile(
    r"(?i)(?<![A-Za-z0-9_.-])(?:\.{1,2}[/\\])?"
    r"(?:[A-Za-z0-9_.-]+[/\\])+[A-Za-z0-9_.-]+(?![A-Za-z0-9_.-])"
)
CODE_FILENAME_PATTERN = re.compile(
    r"(?i)(?<![A-Za-z0-9_.-])[A-Za-z0-9_-]+\."
    r"[A-Za-z][A-Za-z0-9_+-]{0,31}(?![A-Za-z0-9_.-])"
)
CJK_PATH_GLUE_PATTERN = re.compile(
    r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff](?=[A-Za-z0-9_.+~-])"
)
PATH_QUOTE_PAIRS = {"\"": "\"", "'": "'", "`": "`", "“": "”", "‘": "’"}
URL_PATTERN = re.compile(r"(?:https?|ssh|git)://[^\s`'\"<>]+")
EMAIL_PATTERN = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
REMOTE_PATTERN = re.compile(r"(?:[\w.+-]+@[\w.-]+:[^\s`'\"<>]+)")
SECRET_KEY_PATTERN = re.compile(
    r"""(?imx)['"]?(?P<key>api[_-]?key|token|secret|password|authorization|bearer)['"]?
    \s*[:=：＝]\s*"""
)
AUTHORIZATION_HEADER_PATTERN = re.compile(
    r"(?im)(?<![A-Za-z0-9])(?:(?:http|proxy)[-_])?authorization\s*[:=]\s*"
    r"[A-Za-z][A-Za-z0-9._~-]*\s+[^\r\n]+"
)
AUTH_SCHEME_PATTERN = re.compile(
    r"(?i)\b(?:(?:proxy-)?authorization\s*[:=]\s*)?"
    r"(?:basic|bearer)\s+[A-Za-z0-9._~+/=-]{6,}"
)
USER_CREDENTIAL_PATTERN = re.compile(
    r"(?ix)(?<!\S)(?:-u|--user|--proxy-user)(?:\s+|=)"
    r"(?:\"[^\"\r\n]+\"|'[^'\r\n]+'|[^\s`'\"]+)"
)
RAW_USERINFO_PATTERN = re.compile(
    r"(?i)(?<![A-Za-z0-9_.+-])[A-Za-z0-9_.+-]+:"
    r"[^\s`'\"<>:@/\\]+(?![A-Za-z0-9_.+-])"
)
CREDENTIAL_REDACTIONS = (
    (AUTHORIZATION_HEADER_PATTERN, "<auth-credential>"),
    (USER_CREDENTIAL_PATTERN, "<user-credential>"),
    (AUTH_SCHEME_PATTERN, "<auth-credential>"),
    (RAW_USERINFO_PATTERN, "<user-credential>"),
)
ENV_PATTERN = re.compile(r"\b[A-Z][A-Z0-9_]{2,}\s*=\s*[^\s`'\"<>]+")
ENV_NAME_PATTERN = re.compile(r"\b[A-Z][A-Z0-9_]{2,}\b")
INLINE_JSON_PATTERN = re.compile(
    r"(?:\{[^{}]*\}|\[[^\[\]]*\])", re.DOTALL
)
JSON_DELIMITER_PATTERN = re.compile(r"[{}\[\]]")


def _escaped_sequence(text: str, index: int) -> tuple[int, int]:
    if index + 1 >= len(text):
        return index + 1, 1
    if text[index + 1] == "\r" and index + 2 < len(text) and text[index + 2] == "\n":
        return index + 3, 0
    if text[index + 1] in "\r\n":
        return index + 2, 0
    return index + 2, 1


def _quoted_segment_end(text: str, start: int) -> tuple[int, int]:
    quote = text[start]
    index = start + 1
    logical_length = 0
    while index < len(text):
        char = text[index]
        if char == "\\":
            index, increment = _escaped_sequence(text, index)
            logical_length += increment
            continue
        if char == quote:
            return index + 1, logical_length
        logical_length += int(char not in "\r\n")
        index += 1
    return len(text), logical_length


def _nested_expansion_closer(text: str, index: int) -> str | None:
    if text.startswith("$(", index):
        return ")"
    if text.startswith("${", index):
        return "}"
    return None


def _shell_expansion_end(text: str, start: int) -> int:
    stack = [")" if text.startswith("$(", start) else "}"]
    index = start + 2
    while index < len(text) and stack:
        char = text[index]
        if char == "\\":
            index, _increment = _escaped_sequence(text, index)
            continue
        if char in "'\"`":
            index, _length = _quoted_segment_end(text, index)
            continue
        nested_closer = _nested_expansion_closer(text, index)
        if nested_closer:
            stack.append(nested_closer)
            index += 2
            continue
        opener = "(" if stack[-1] == ")" else "{"
        if char == opener:
            stack.append(stack[-1])
        elif char == stack[-1]:
            stack.pop()
        index += 1
    return index


def _is_redacted_placeholder(text: str, start: int) -> bool:
    placeholder_end = start + len("<redacted>")
    return text.startswith("<redacted>", start) and (
        placeholder_end == len(text) or text[placeholder_end].isspace()
    )


def _secret_value_step(text: str, index: int) -> tuple[int, int, bool]:
    char = text[index]
    if text.startswith(("$(", "${"), index):
        return _shell_expansion_end(text, index), 0, True
    if char == "$" and index + 1 < len(text) and text[index + 1] in "'\"":
        return index + 1, 0, False
    if char in "'\"`":
        end, length = _quoted_segment_end(text, index)
        return end, length, False
    if char == "\\":
        end, length = _escaped_sequence(text, index)
        return end, length, False
    return index + 1, 1, False


def _secret_value_end(text: str, start: int) -> int | None:
    if _is_redacted_placeholder(text, start):
        return None

    index = start
    logical_length = 0
    has_expansion = False
    starts_quoted = (
        index < len(text) and text[index] in "'\"`"
    ) or text.startswith(("$'", '$"'), index)
    while index < len(text) and not text[index].isspace():
        index, increment, expanded = _secret_value_step(text, index)
        logical_length += increment
        has_expansion = has_expansion or expanded

    minimum = 4 if starts_quoted else 6
    return index if has_expansion or logical_length >= minimum else None


def secret_assignment_spans(text: str) -> list[tuple[int, int, str]]:
    spans: list[tuple[int, int, str]] = []
    cursor = 0
    while match := SECRET_KEY_PATTERN.search(text, cursor):
        end = _secret_value_end(text, match.end())
        if end is None:
            cursor = match.end()
            continue
        spans.append((match.start(), end, match.group("key")))
        cursor = end
    return spans


def contains_secret_assignment(text: str) -> bool:
    return bool(secret_assignment_spans(text))


def redact_secret_assignments(text: str) -> str:
    spans = secret_assignment_spans(text)
    if not spans:
        return text
    pieces: list[str] = []
    cursor = 0
    for start, end, key in spans:
        pieces.extend((text[cursor:start], f"{key}=<redacted>"))
        cursor = end
    pieces.append(text[cursor:])
    return "".join(pieces)


def redact_credentials(text: str) -> str:
    for pattern, replacement in CREDENTIAL_REDACTIONS:
        text = pattern.sub(replacement, text)
    return text


def redact(text: str, limit: int = 1200) -> str:
    text = redact_credentials(text)
    text = redact_secret_assignments(text)
    text = re.sub(r"sk-[A-Za-z0-9]{20,}", "sk-<redacted>", text)
    text = re.sub(r"gh[pousr]_[A-Za-z0-9_]{20,}", "gh_<redacted>", text)
    text = text.replace("\x00", "")
    if len(text) > limit:
        return text[:limit] + "...<truncated>"
    return text


def redact_inline_json(text: str) -> str:
    while True:
        redacted, count = INLINE_JSON_PATTERN.subn("<tool-arguments>", text)
        text = redacted
        if count == 0:
            break
    if JSON_DELIMITER_PATTERN.search(text):
        return "<tool-arguments>"
    return text


def contains_inline_json(text: str) -> bool:
    return bool(INLINE_JSON_PATTERN.search(text) or JSON_DELIMITER_PATTERN.search(text))


def _filename_extension(value: str) -> str | None:
    base, separator, extension = value.rpartition(".")
    if not base or not separator or not PATH_EXTENSION_PATTERN.fullmatch(extension):
        return None
    if extension.isnumeric():
        return None
    if not extension.isascii() and len(extension) > 3:
        return None
    return extension


def _has_cjk_path_glue(value: str, *, terminal_filename: bool = False) -> bool:
    extension = _filename_extension(value) if terminal_filename else None
    for transition in CJK_PATH_GLUE_PATTERN.finditer(value):
        if extension is not None and value[transition.end()] == ".":
            continue
        return True
    return False


def _trim_trailing_dots(text: str, start: int, end: int) -> int:
    while end > start and text[end - 1] == ".":
        end -= 1
    return end


def _quoted_path_end(text: str, start: int, end: int) -> int | None:
    opener = text[start - 1] if start else ""
    closer = PATH_QUOTE_PAIRS.get(opener)
    if not closer:
        return None
    close = text.find(closer, end)
    return close if close >= 0 else None


def _spaced_path_end(text: str, start: int, end: int) -> int:
    while continuation := PATH_SPACED_CONTINUATION_PATTERN.match(text, end):
        if _has_cjk_path_glue(continuation.group(1)):
            return end
        end = _trim_trailing_dots(text, start, continuation.end())
    return end


def _following_filename_end(text: str, cursor: int) -> int | None:
    for _ in range(2):
        word = PATH_SPACED_WORD_PATTERN.match(text, cursor)
        if not word:
            return None
        token_end = _trim_trailing_dots(text, word.start(1), word.end(1))
        token = text[word.start(1):token_end]
        is_filename = _filename_extension(token) is not None
        is_separate = token_end == len(text) or text[token_end] not in "/\\"
        if is_filename and is_separate and not _has_cjk_path_glue(token, terminal_filename=True):
            return token_end
        cursor = word.end()
    return None


def _absolute_path_end(text: str, match: re.Match[str]) -> int:
    end = _trim_trailing_dots(text, match.start(), match.end())
    quoted_end = _quoted_path_end(text, match.start(), end)
    if quoted_end is not None:
        return quoted_end
    end = _spaced_path_end(text, match.start(), end)
    return _following_filename_end(text, end) or end


def redact_absolute_paths(text: str) -> str:
    pieces: list[str] = []
    cursor = 0
    for match in PATH_PATTERN.finditer(text):
        if match.start() < cursor:
            continue
        pieces.extend((text[cursor:match.start()], "<local-path>"))
        cursor = _absolute_path_end(text, match)
    pieces.append(text[cursor:])
    return "".join(pieces)


def public_projection_payload(context: dict[str, object]) -> dict[str, object]:
    return {
        "privacy": context.get("privacy"),
        "source": context.get("source"),
        "allowed_fields": context.get("allowed_fields"),
        "incidents": context.get("incidents"),
    }


def public_projection_hash(context: dict[str, object]) -> str:
    raw = json.dumps(
        public_projection_payload(context),
        ensure_ascii=False,
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def publication_approval_hash(
    projection_hash: str,
    target_repo: str,
    approval_id: str,
) -> str:
    raw = json.dumps(
        {
            "projection_hash": projection_hash,
            "target_repo": target_repo,
            "approval_id": approval_id,
        },
        ensure_ascii=False,
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


INCIDENT_KIND_LABELS = {
    "instruction_failure": "指令失效",
    "routing_failure": "路由失效",
    "tool_failure": "工具失效",
    "rule_ambiguity": "规则不清",
    "user_correction": "用户纠正",
    "other": "其他",
}


def public_incident_kind_label(value: object) -> str:
    raw = str(value or "").strip()
    return INCIDENT_KIND_LABELS.get(raw, raw or "未知")


def render_public_issue(context: dict[str, object]) -> str:
    incidents = context.get("incidents")
    if not isinstance(incidents, list) or len(incidents) != 1:
        raise ValueError("public preview requires exactly one incident")
    incident = incidents[0]
    if not isinstance(incident, dict):
        raise ValueError("public preview incident must be an object")
    labels = (
        ("事件类型", "incident_kind"),
        ("目标技能", "target_skill"),
        ("预期行为", "expected_behavior"),
        ("实际行为", "actual_behavior"),
        ("影响", "impact"),
        ("建议修法", "proposed_fix"),
    )
    values = {
        **incident,
        "incident_kind": public_incident_kind_label(incident.get("incident_kind")),
    }
    return "# 技能反馈\n\n" + "\n".join(
        f"- **{label}:** {values.get(key) or '未知'}"
        for label, key in labels
    ) + "\n"


def public_redact(
    text: str,
    limit: int = 300,
    private_tokens: set[str] | None = None,
) -> str:
    text = re.sub(r"```.*?(?:```|\Z)", "<code-block>", text, flags=re.DOTALL)
    text = redact_credentials(text)
    text = re.sub(r"\s+", " ", text).strip()
    text = redact_inline_json(text)
    text = ENV_PATTERN.sub("<env>", text)
    text = redact(text, limit=limit * 4)
    text = REMOTE_PATTERN.sub("<repo-remote>", text)
    text = URL_PATTERN.sub("<url>", text)
    text = redact_absolute_paths(text)
    text = EMAIL_PATTERN.sub("<email>", text)
    text = ENV_NAME_PATTERN.sub("<env-name>", text)
    text = RELATIVE_CODE_PATH_PATTERN.sub("<private-reference>", text)
    text = CODE_FILENAME_PATTERN.sub("<private-reference>", text)
    for token in sorted(private_tokens or set(), key=len, reverse=True):
        if not token:
            continue
        text = re.sub(
            rf"(?<![A-Za-z0-9_.-]){re.escape(token)}(?![A-Za-z0-9_.-])",
            "<private-repository>",
            text,
            flags=re.IGNORECASE,
        )
    if len(text) > limit:
        return text[:limit] + "...<truncated>"
    return text
