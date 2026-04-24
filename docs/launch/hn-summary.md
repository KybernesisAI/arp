# Hacker News launch summary

**Status:** [DRAFT — FOR PUBLICATION REVIEW]

**Target length:** ≤ 250 words.

**Character count (current draft):** ~220 words.

---

## One-paragraph version (for HN "Show HN" body)

Hi HN — we're releasing ARP, the Agent Relationship Protocol, for public
review. ARP is the open communication and permissions layer for
agent-to-agent software: sovereign Handshake `.agent` names,
method-agnostic principal DIDs (`did:key` default, `did:web` optional),
Cedar-first permissions with 50 reusable scope templates, signed DIDComm
transport over DID-pinned TLS, and a tamper-detecting per-tenant audit
chain. We think the agent ecosystem needs a shared contract between
frameworks — not another framework — and we're shipping the reference
implementation, five framework adapters (KyberBot, OpenClaw,
Hermes-Agent, NanoClaw, LangGraph), a TypeScript SDK with a Python
scaffold, an `npx @kybernesis/arp-testkit audit <domain>` compliance
probe with 11 checks, and a hosted free-tier runtime at
[cloud.arp.run](https://cloud.arp.run). The spec lives at
[spec.arp.run](https://spec.arp.run); the repo is at
[github.com/KybernesisAI/arp](https://github.com/KybernesisAI/arp). MIT
licensed. We'd love your feedback on whether this is the right shape of
contract — we'd love your RFCs even more.

---

## Title options (pick one)

- `Show HN: ARP — An open protocol for how autonomous agents talk, delegate, and get revoked`
- `Show HN: Agent Relationship Protocol — sovereign names + Cedar policy + DIDComm for agents`
- `Show HN: ARP — A contract between agent frameworks, not another framework`

## Notes for the poster

- Post on a weekday morning US-Eastern (9–11 AM). Never Friday.
- Be the first commenter — pin a short "what ARP is/isn't" clarifier to
  pre-empt the "how is this different from MCP?" thread.
- Don't top-post marketing copy. Answer questions directly + link into
  the spec.
- Have the `@kybernesis/arp-testkit` CLI working on `latest` before
  posting — the first thing HN will do is `npx @kybernesis/arp-testkit
  audit samantha.agent`.
