"""
Mirror of the TS SDK's `guardAction` helper. Adapter authors building
Python integrations use this to wrap a framework call with an ARP check
→ run → egress pipeline.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional

from .types import Obligation, PdpDecision, Resource


@dataclass
class GuardResult:
    allow: bool
    data: Any = None
    obligations: list[Obligation] = field(default_factory=list)
    reason: Optional[str] = None
    decision: Optional[PdpDecision] = None


async def guard_action(
    agent: Any,
    *,
    connection_id: str,
    action: str,
    resource: Resource | dict[str, Any],
    run: Callable[[], Awaitable[Any]] | Callable[[], Any],
    context: Optional[dict[str, Any]] = None,
    audit: bool = True,
) -> GuardResult:
    """Route a framework tool call through ARP: check, run, egress, audit."""

    decision = await agent.check(
        action=action,
        resource=resource,
        connection_id=connection_id,
        context=context or {},
    )

    if not decision.allow:
        if audit:
            await agent.audit(
                connection_id=connection_id,
                decision="deny",
                reason="; ".join(decision.reasons) or "policy_denied",
                policies_fired=list(decision.policies_fired),
            )
        return GuardResult(
            allow=False,
            reason="; ".join(decision.reasons) or "policy_denied",
            decision=decision,
        )

    raw = run()
    if hasattr(raw, "__await__"):
        raw = await raw  # type: ignore[assignment]

    filtered = await agent.egress(
        data=raw,
        connection_id=connection_id,
        obligations=decision.obligations,
    )

    if audit:
        await agent.audit(
            connection_id=connection_id,
            decision="allow",
            policies_fired=list(decision.policies_fired),
            obligations=list(decision.obligations),
        )

    return GuardResult(
        allow=True,
        data=filtered,
        obligations=decision.obligations,
        decision=decision,
    )
