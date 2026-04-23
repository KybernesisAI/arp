"""Public-API smoke tests for the Python SDK."""

from __future__ import annotations

import pytest

from arp_sdk import ArpAgent, Obligation, Resource, apply_obligations, guard_action


def _handoff_dict() -> dict:
    return {
        "agent_did": "did:web:py.agent",
        "principal_did": "did:web:owner.self.xyz",
        "public_key_multibase": "z" + "1" * 46,
        "well_known_urls": {
            "did": "https://py.agent/.well-known/did.json",
            "agent_card": "https://py.agent/.well-known/agent-card.json",
            "arp": "https://py.agent/.well-known/arp.json",
        },
        "dns_records_published": ["A"],
        "cert_expires_at": "2030-01-01T00:00:00.000Z",
        "bootstrap_token": "stub",
    }


@pytest.mark.asyncio
async def test_from_handoff_accepts_dict():
    agent = await ArpAgent.from_handoff(_handoff_dict())
    assert agent.did == "did:web:py.agent"
    assert agent.principal_did == "did:web:owner.self.xyz"


@pytest.mark.asyncio
async def test_from_handoff_rejects_private_key_leak():
    raw = _handoff_dict()
    raw["private_key"] = "leaked"
    with pytest.raises(ValueError):
        await ArpAgent.from_handoff(raw)


@pytest.mark.asyncio
async def test_check_denies_unknown_connection():
    agent = await ArpAgent.from_handoff(_handoff_dict())
    decision = await agent.check(
        action="read",
        resource=Resource(type="Doc", id="x"),
        connection_id="conn_missing",
    )
    assert decision.allow is False


@pytest.mark.asyncio
async def test_check_allows_seeded_connection_and_egress_redacts():
    agent = await ArpAgent.from_handoff(_handoff_dict())
    agent.seed_connection(
        "conn_py_test",
        peer_did="did:web:peer.agent",
        obligations=[Obligation(type="redact_fields", params={"fields": ["secret"]})],
    )
    decision = await agent.check(
        action="read",
        resource={"type": "Doc", "id": "x"},
        connection_id="conn_py_test",
    )
    assert decision.allow is True
    filtered = await agent.egress(
        data={"summary": "ok", "secret": "x"},
        connection_id="conn_py_test",
    )
    assert filtered["summary"] == "ok"
    assert "secret" not in filtered


@pytest.mark.asyncio
async def test_audit_accumulates_and_on_revocation_fires():
    agent = await ArpAgent.from_handoff(_handoff_dict())
    agent.seed_connection("conn_py_rev", peer_did="did:web:peer.agent")
    seen: list[str] = []
    agent.on("revocation", lambda e: seen.append(e.connection_id))
    await agent.audit(connection_id="conn_py_rev", decision="allow", reason="ok")
    agent.revoke_connection("conn_py_rev", reason="test")
    assert "conn_py_rev" in seen
    assert len(agent.audit_log("conn_py_rev")) == 1


@pytest.mark.asyncio
async def test_guard_action_routes_allow_and_deny():
    agent = await ArpAgent.from_handoff(_handoff_dict())
    agent.seed_connection(
        "conn_guard",
        peer_did="did:web:peer.agent",
        obligations=[Obligation(type="redact_fields", params={"fields": ["inner"]})],
    )

    async def run_ok():
        return {"outer": 1, "inner": "s"}

    ok = await guard_action(
        agent,
        connection_id="conn_guard",
        action="search",
        resource={"type": "Tool", "id": "search"},
        run=run_ok,
    )
    assert ok.allow
    assert ok.data == {"outer": 1}  # inner redacted

    # Denied — unknown connection.
    async def run_bad():
        raise AssertionError("should not run")

    deny = await guard_action(
        agent,
        connection_id="conn_missing",
        action="search",
        resource={"type": "Tool", "id": "search"},
        run=run_bad,
    )
    assert deny.allow is False


def test_apply_obligations_unit():
    result = apply_obligations(
        {"a": 1, "b": 2},
        [Obligation(type="redact_fields", params={"fields": ["b"]})],
    )
    assert result == {"a": 1}
