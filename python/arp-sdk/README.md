# arp-sdk (Python)

Python SDK for the [Agent Relationship Protocol](https://github.com/KybernesisAI/arp).

Mirrors the TypeScript SDK (`@kybernesis/arp-sdk`) 1:1.

## Status: v0.1.0 scaffold

The Python SDK ships with:

- The full public API (`ArpAgent`, `check`, `egress`, `audit`, `on_incoming`, `on(...)`, `guard_action`).
- A pure-Python obligation engine with wire parity against the TS SDK.
- A connection-registry and audit-log backed by in-process state — usable for CI harnesses, local development, and adapter authoring.

**Not yet wired:**

- Cedar policy evaluation (lands v1.1 via `cedarpy` bindings).
- DIDComm transport / HTTP listener (use `@kybernesis/arp-sidecar` Mode B to front a Python agent until v1.1).

The public API is stable now so Python adapter authors can build against it and the implementation is filled in behind the scenes.

## Install

```bash
pip install arp-sdk   # once published
# or for local dev:
pip install -e '.[dev]'
```

## Quickstart

```python
import asyncio
from arp_sdk import ArpAgent, Obligation, Resource, guard_action


async def main() -> None:
    agent = await ArpAgent.from_handoff("./arp-handoff.json")
    agent.seed_connection(
        "conn_alpha",
        peer_did="did:web:peer.agent",
        obligations=[Obligation(type="redact_fields", params={"fields": ["secret"]})],
    )

    async def do_search() -> dict:
        return {"hits": ["a"], "secret": "x"}

    result = await guard_action(
        agent,
        connection_id="conn_alpha",
        action="search",
        resource={"type": "Tool", "id": "search"},
        run=do_search,
    )
    if result.allow:
        print(result.data)       # -> {'hits': ['a']}  (secret redacted by obligation)
    else:
        print("denied:", result.reason)


asyncio.run(main())
```

## Why the API mirrors TypeScript

Agent adapter authors should be able to read either SDK's source and map calls 1:1. Wire formats, obligation types, scope catalog versions, and handoff bundles are shared across languages — the SDKs only differ in their respective idioms (`camelCase` vs `snake_case`, `Promise` vs `asyncio`).

## Related

- TypeScript SDK: [`@kybernesis/arp-sdk`](https://npmjs.com/package/@kybernesis/arp-sdk)
- Adapter authoring guide: `docs/ARP-adapter-authoring-guide.md`
- Installation guide: `docs/ARP-installation-and-hosting.md`

## License

MIT
