"""Typed shapes that mirror `@kybernesis/arp-sdk/src/types.ts`."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Literal, Optional


@dataclass
class Obligation:
    type: str
    params: dict[str, Any] = field(default_factory=dict)


@dataclass
class Resource:
    type: str
    id: str
    attrs: Optional[dict[str, Any]] = None
    parents: Optional[list[dict[str, str]]] = None


@dataclass
class PdpDecision:
    decision: Literal["allow", "deny"]
    obligations: list[Obligation] = field(default_factory=list)
    policies_fired: list[str] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)

    @property
    def allow(self) -> bool:
        return self.decision == "allow"


@dataclass
class CheckInput:
    action: str
    resource: Resource
    connection_id: str
    context: dict[str, Any] = field(default_factory=dict)


@dataclass
class EgressInput:
    data: Any
    connection_id: str
    obligations: Optional[list[Obligation]] = None


@dataclass
class AuditEvent:
    connection_id: str
    decision: str = "event"
    reason: Optional[str] = None
    policies_fired: list[str] = field(default_factory=list)
    obligations: list[Obligation] = field(default_factory=list)
    metadata: Optional[dict[str, Any]] = None
    message_id: Optional[str] = None


@dataclass
class InboundTask:
    action: str
    resource: Resource
    context: dict[str, Any]
    body: dict[str, Any]
    message_id: str
    thread_id: Optional[str]


@dataclass
class InboundContext:
    connection_id: str
    peer_did: str
    decision: PdpDecision
    memory: Any


InboundHandler = Callable[
    [InboundTask, InboundContext], Awaitable[Optional[dict[str, Any]]]
]


@dataclass
class RevocationEvent:
    connection_id: str
    reason: str
    at: float


@dataclass
class RotationEvent:
    did: str
    at: float


@dataclass
class PairingEvent:
    connection_id: str
    peer_did: str
    at: float


@dataclass
class HandoffBundle:
    agent_did: str
    principal_did: str
    public_key_multibase: str
    well_known_urls: dict[str, str]
    dns_records_published: list[str]
    cert_expires_at: str
    bootstrap_token: str
