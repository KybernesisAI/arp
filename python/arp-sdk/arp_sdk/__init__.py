"""
arp_sdk — Python SDK for the Agent Relationship Protocol.

Mirrors the @kybernesis/arp-sdk (TypeScript) surface:

    from arp_sdk import ArpAgent, guard_action

    agent = await ArpAgent.from_handoff("./arp-handoff.json",
        on_incoming=lambda task, ctx: handle(task, ctx))
    await agent.start(port=443)

    decision = await agent.check(
        action="read", resource=res, connection_id=conn)
    if decision.allow:
        ...

**Status — v0.1.0, scaffold.** The Cedar PDP and DIDComm transport bindings
are imported lazily so the public API can be exercised without the full
native-dependency stack. See README.md for the roadmap to a
functionally-complete SDK. The TypeScript SDK (`@kybernesis/arp-sdk`) is
the canonical reference implementation; this package tracks its public API
1:1 but lags on internal implementation until the v1.1 release cycle per
Phase-6 §1.
"""

from .agent import ArpAgent  # noqa: F401
from .guard import guard_action, GuardResult  # noqa: F401
from .obligations import apply_obligations  # noqa: F401
from .types import (  # noqa: F401
    AuditEvent,
    CheckInput,
    EgressInput,
    HandoffBundle,
    InboundContext,
    InboundTask,
    Obligation,
    PdpDecision,
    Resource,
    RevocationEvent,
    RotationEvent,
    PairingEvent,
)

__all__ = [
    "ArpAgent",
    "AuditEvent",
    "CheckInput",
    "EgressInput",
    "GuardResult",
    "HandoffBundle",
    "InboundContext",
    "InboundTask",
    "Obligation",
    "PdpDecision",
    "Resource",
    "RevocationEvent",
    "RotationEvent",
    "PairingEvent",
    "apply_obligations",
    "guard_action",
]

__version__ = "0.1.0"
