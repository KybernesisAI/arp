"""
Egress obligation pipeline — mirrors
`@kybernesis/arp-sdk/src/obligations.ts`.

Supported obligation types (same list as the TS SDK for wire parity):
  - redact_fields
  - redact_fields_except
  - redact_regex
  - summarize_only
  - aggregate_only
  - insert_watermark
  - no_downstream_share

Non-payload obligations (rate_limit, require_fresh_consent, charge_usd, ...)
pass through — they're enforced elsewhere in the stack.
"""

from __future__ import annotations

import copy
import json
import re
from typing import Any, Callable, Iterable, Optional

from .types import Obligation


def apply_obligations(
    payload: Any,
    obligations: Iterable[Obligation],
    on_unknown: Optional[Callable[[str, dict[str, Any]], None]] = None,
) -> Any:
    """Apply the supplied obligations to `payload`. Returns a new value."""
    current = copy.deepcopy(payload)
    for o in obligations:
        current = _apply_one(current, o, on_unknown)
    return current


def _apply_one(
    payload: Any,
    obligation: Obligation,
    on_unknown: Optional[Callable[[str, dict[str, Any]], None]],
) -> Any:
    t = obligation.type
    params = obligation.params or {}
    if t == "redact_fields":
        return _redact_fields(payload, _string_list(params.get("fields")))
    if t == "redact_fields_except":
        return _redact_fields_except(
            payload, _string_list(params.get("fields"))
        )
    if t == "redact_regex":
        pattern = params.get("pattern")
        if not isinstance(pattern, str):
            return payload
        replacement = params.get("replacement")
        return _redact_regex(
            payload, pattern, replacement if isinstance(replacement, str) else "[redacted]"
        )
    if t == "summarize_only":
        max_words = params.get("max_words")
        if not isinstance(max_words, int):
            max_words = 50
        return _summarize_only(payload, max_words)
    if t == "aggregate_only":
        return _aggregate_only(payload)
    if t == "insert_watermark":
        return _add_marker(payload, "_watermark", params)
    if t == "no_downstream_share":
        return _add_marker(payload, "_no_downstream_share", True)
    if t in {
        "rate_limit",
        "require_fresh_consent",
        "require_vc",
        "log_audit_level",
        "delete_after",
        "notify_principal",
        "charge_usd",
    }:
        return payload
    if on_unknown:
        on_unknown(t, params)
    return payload


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [v for v in value if isinstance(v, str)]


def _redact_fields(payload: Any, fields: list[str]) -> Any:
    if not fields:
        return payload
    out = copy.deepcopy(payload)
    for path in fields:
        _delete_path(out, path.split("."))
    return out


def _redact_fields_except(payload: Any, fields: list[str]) -> Any:
    if not isinstance(payload, dict):
        return payload
    if not fields:
        return {}
    allow = set(fields)
    return {k: v for k, v in payload.items() if k in allow}


def _redact_regex(payload: Any, pattern: str, replacement: str) -> Any:
    try:
        regex = re.compile(pattern)
    except re.error:
        return payload

    def walk(v: Any) -> Any:
        if isinstance(v, str):
            return regex.sub(replacement, v)
        if isinstance(v, list):
            return [walk(i) for i in v]
        if isinstance(v, dict):
            return {k: walk(val) for k, val in v.items()}
        return v

    return walk(payload)


def _summarize_only(payload: Any, max_words: int) -> Any:
    text = payload if isinstance(payload, str) else json.dumps(payload, default=str)
    words = [w for w in text.split() if w]
    summary = " ".join(words[:max_words])
    return {"summary": summary, "_obligation": "summarize_only", "max_words": max_words}


def _aggregate_only(payload: Any) -> Any:
    if isinstance(payload, list):
        return {
            "count": len(payload),
            "aggregate": "count",
            "_obligation": "aggregate_only",
        }
    if isinstance(payload, dict):
        for k, v in payload.items():
            if isinstance(v, list):
                return {
                    k: {"count": len(v), "aggregate": "count"},
                    "_obligation": "aggregate_only",
                }
    return {"aggregate": "count", "count": 1, "_obligation": "aggregate_only"}


def _add_marker(payload: Any, key: str, value: Any) -> Any:
    if not isinstance(payload, dict):
        return {"value": payload, key: value}
    return {**payload, key: value}


def _delete_path(target: Any, segments: list[str]) -> None:
    if not isinstance(target, dict) or not segments:
        return
    head, *rest = segments
    if not rest:
        target.pop(head, None)
        return
    nxt = target.get(head)
    if isinstance(nxt, list):
        for item in nxt:
            _delete_path(item, rest)
        return
    _delete_path(nxt, rest)
