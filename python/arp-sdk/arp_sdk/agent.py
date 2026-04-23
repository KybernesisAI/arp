"""
Python `ArpAgent` — public API parity with the TypeScript SDK.

**v0.1.0 scope.** The Python SDK is published as a scaffold with:

- A full public API surface that matches `@kybernesis/arp-sdk` one-for-one
  (so adapter authors can type-check against it).
- A pure-Python `check` / `egress` / `audit` pipeline using the same
  obligation engine as the TS SDK.
- **Stubs** for handoff bootstrap, DIDComm transport, and Cedar evaluation.

The Cedar engine + DIDComm transport will be wired in the Phase-6 follow-up
(v1.1). Until then, agents can use the Python SDK for in-process
ARP-guarded tool calls against a pre-seeded connection registry (tests,
CI harnesses, local development). For full DIDComm interoperability use
the TypeScript SDK, or front the Python agent with the sidecar
(`@kybernesis/arp-sidecar`) via Mode B (see
`docs/ARP-installation-and-hosting.md §3.2`).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable, Literal, Optional

from .obligations import apply_obligations
from .types import (
    AuditEvent,
    CheckInput,
    EgressInput,
    HandoffBundle,
    InboundHandler,
    Obligation,
    PairingEvent,
    PdpDecision,
    Resource,
    RevocationEvent,
    RotationEvent,
)


@dataclass
class _ConnectionRecord:
    connection_id: str
    peer_did: str
    status: Literal["active", "suspended", "revoked"] = "active"
    obligations: list[Obligation] = field(default_factory=list)
    cedar_policies: list[str] = field(default_factory=list)


class ArpAgent:
    """Developer-facing ARP agent (Python).

    Mirrors the public surface of the TypeScript `ArpAgent`. See
    `docs/ARP-installation-and-hosting.md §8` for the five integration
    points (`check`, `egress`, `on_incoming`, `audit`, `on`).
    """

    def __init__(
        self,
        *,
        did: str,
        principal_did: str,
        public_key_multibase: str,
        data_dir: Optional[str] = None,
    ) -> None:
        self.did = did
        self.principal_did = principal_did
        self.public_key_multibase = public_key_multibase
        self.data_dir = Path(data_dir) if data_dir else Path(".arp-data")
        self._connections: dict[str, _ConnectionRecord] = {}
        self._audit: dict[str, list[dict[str, Any]]] = {}
        self._inbound_handler: Optional[InboundHandler] = None
        self._revocation_handlers: list[Callable[[RevocationEvent], None]] = []
        self._rotation_handlers: list[Callable[[RotationEvent], None]] = []
        self._pairing_handlers: list[Callable[[PairingEvent], None]] = []

    # ------------------------------------------------------------------
    # Factory
    # ------------------------------------------------------------------
    @classmethod
    async def from_handoff(
        cls,
        handoff: "HandoffBundle | str | dict[str, Any]",
        *,
        on_incoming: Optional[InboundHandler] = None,
        data_dir: Optional[str] = None,
    ) -> "ArpAgent":
        bundle = _load_handoff(handoff)
        agent = cls(
            did=bundle.agent_did,
            principal_did=bundle.principal_did,
            public_key_multibase=bundle.public_key_multibase,
            data_dir=data_dir,
        )
        if on_incoming is not None:
            agent._inbound_handler = on_incoming
        return agent

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    async def start(self, *, port: int = 4500, host: str = "127.0.0.1") -> dict[str, Any]:
        """Start the HTTP DIDComm listener.

        v0.1.0: no-op (the Python SDK does not yet bind a DIDComm server;
        see module docstring). Returns placeholder metadata so the API
        shape matches the TS SDK.
        """
        return {"hostname": host, "port": port, "note": "arp_sdk v0.1.0 scaffold — HTTP listener not yet bound"}

    async def stop(self, *, grace_ms: int = 5000) -> None:
        return None

    def on_incoming(self, handler: InboundHandler) -> None:
        self._inbound_handler = handler

    # ------------------------------------------------------------------
    # 5 integration points
    # ------------------------------------------------------------------
    async def check(
        self,
        *,
        action: str,
        resource: Resource | dict[str, Any],
        connection_id: str,
        context: Optional[dict[str, Any]] = None,
    ) -> PdpDecision:
        _ = CheckInput(
            action=action,
            resource=_coerce_resource(resource),
            connection_id=connection_id,
            context=context or {},
        )
        record = self._connections.get(connection_id)
        if record is None:
            return PdpDecision(
                decision="deny",
                reasons=[f"unknown_connection:{connection_id}"],
            )
        if record.status != "active":
            return PdpDecision(
                decision="deny",
                reasons=[f"connection_{record.status}"],
            )
        # v0.1.0: allow-all, pass static token obligations through. Cedar
        # binding lands in v1.1 — at that point this switches to a real
        # policy evaluation. API surface stays identical.
        return PdpDecision(
            decision="allow",
            obligations=list(record.obligations),
            policies_fired=[p for p in record.cedar_policies if p],
        )

    async def egress(
        self,
        *,
        data: Any,
        connection_id: str,
        obligations: Optional[list[Obligation]] = None,
    ) -> Any:
        _ = EgressInput(data=data, connection_id=connection_id, obligations=obligations)
        if obligations is None:
            record = self._connections.get(connection_id)
            obligations = list(record.obligations) if record else []
        return apply_obligations(data, obligations)

    async def audit(
        self,
        *,
        connection_id: str,
        decision: str = "event",
        reason: Optional[str] = None,
        policies_fired: Optional[list[str]] = None,
        obligations: Optional[list[Obligation]] = None,
        metadata: Optional[dict[str, Any]] = None,
        message_id: Optional[str] = None,
    ) -> None:
        entry = {
            "msg_id": message_id or f"py_{len(self._audit.get(connection_id, []))}",
            "decision": decision,
            "reason": reason,
            "policies_fired": policies_fired or [],
            "obligations": [{"type": o.type, "params": o.params} for o in (obligations or [])],
            "metadata": metadata or {},
        }
        self._audit.setdefault(connection_id, []).append(entry)

    def on(
        self,
        event: Literal["revocation", "rotation", "pairing"],
        handler: Callable[..., None],
    ) -> None:
        if event == "revocation":
            self._revocation_handlers.append(handler)
        elif event == "rotation":
            self._rotation_handlers.append(handler)
        elif event == "pairing":
            self._pairing_handlers.append(handler)

    # ------------------------------------------------------------------
    # Admin / testing helpers (wired up to mirror TS SDK's ConnectionAPI)
    # ------------------------------------------------------------------
    def seed_connection(
        self,
        connection_id: str,
        *,
        peer_did: str,
        obligations: Optional[list[Obligation]] = None,
        cedar_policies: Optional[list[str]] = None,
    ) -> None:
        self._connections[connection_id] = _ConnectionRecord(
            connection_id=connection_id,
            peer_did=peer_did,
            obligations=list(obligations or []),
            cedar_policies=list(cedar_policies or []),
        )
        import time

        at = time.time()
        for h in self._pairing_handlers:
            h(PairingEvent(connection_id=connection_id, peer_did=peer_did, at=at))

    def revoke_connection(self, connection_id: str, *, reason: str = "owner_revoked") -> None:
        rec = self._connections.get(connection_id)
        if rec:
            rec.status = "revoked"
        import time

        at = time.time()
        for h in self._revocation_handlers:
            h(RevocationEvent(connection_id=connection_id, reason=reason, at=at))

    def audit_log(self, connection_id: str) -> list[dict[str, Any]]:
        """Return the in-memory audit entries for the given connection."""
        return list(self._audit.get(connection_id, []))


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
def _load_handoff(input: Any) -> HandoffBundle:
    if isinstance(input, HandoffBundle):
        return input
    if isinstance(input, str):
        raw = json.loads(Path(input).read_text())
    elif isinstance(input, dict):
        raw = input
    else:
        raise TypeError(f"handoff must be path, dict, or HandoffBundle; got {type(input)!r}")
    _reject_forbidden_fields(raw)
    return HandoffBundle(
        agent_did=raw["agent_did"],
        principal_did=raw["principal_did"],
        public_key_multibase=raw["public_key_multibase"],
        well_known_urls=raw["well_known_urls"],
        dns_records_published=list(raw.get("dns_records_published", [])),
        cert_expires_at=raw["cert_expires_at"],
        bootstrap_token=raw.get("bootstrap_token", ""),
    )


def _reject_forbidden_fields(value: Any, path: str = "$") -> None:
    if not isinstance(value, dict):
        return
    for k, v in value.items():
        if k.startswith("private") or k.startswith("secret") or "private_key" in k.lower():
            raise ValueError(
                f"handoff bundle contains forbidden field \"{path}.{k}\"; "
                "private material must not ship in a handoff"
            )
        _reject_forbidden_fields(v, f"{path}.{k}")


def _coerce_resource(spec: Any) -> Resource:
    if isinstance(spec, Resource):
        return spec
    if isinstance(spec, str):
        parts = spec.split(":", 1)
        return Resource(type=parts[0] or "Resource", id=parts[-1] or spec)
    if isinstance(spec, dict):
        return Resource(
            type=str(spec.get("type", "Resource")),
            id=str(spec.get("id", "default")),
            attrs=spec.get("attrs"),
            parents=spec.get("parents"),
        )
    return Resource(type="Resource", id="default")


__all__ = ["ArpAgent"]

# Silence unused-import warnings for optional types above.
_ = (AuditEvent, Awaitable)
