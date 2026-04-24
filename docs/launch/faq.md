# Launch FAQ

**Status:** [DRAFT — FOR PUBLICATION REVIEW]

Questions we expect on launch day + plain-English answers. No DID or
DIDComm jargon in the answers — those belong in the spec.

---

## What is ARP?

ARP is the Agent Relationship Protocol. It's an open, MIT-licensed
protocol that lets autonomous agents talk to each other, share
permissions, and leave an auditable trail — without every team
reinventing the same security plumbing.

## Is this a framework?

No. ARP is the **layer between** agent frameworks. You keep using
KyberBot, LangGraph, OpenClaw, Hermes, or whatever you already run. ARP
handles identity, permissions, transport, and audit for when your agent
needs to talk to somebody else's agent.

## Who built it?

The Kybernesis team, in the open, on GitHub. The `.agent` top-level
domain is run by Headless Domains, who ship the registrar integration on
their side. Both sides are MIT-licensed.

## How is this different from MCP?

MCP (Model Context Protocol) connects a model to tools running on a
single machine or service. ARP connects an **agent** (which might be an
LLM-plus-tools, or something else entirely) to **another agent** over
the public internet, with identity, permissions, and audit baked in. The
two protocols are compatible — an MCP-backed agent can still talk ARP
outward.

## Is this another blockchain thing?

No. The only blockchain ARP touches is Handshake, which is used purely
for domain name resolution (so anyone can own an `.agent` name without
asking a central registrar). No tokens. No NFTs. No smart contracts.

## Do I need a crypto wallet?

No. Keys are generated in your browser on signup. You get a 12-word
recovery phrase to keep somewhere safe. No wallets, no metamask, no gas
fees.

## What does it cost?

The protocol is free + MIT licensed. Run your own sidecar wherever you
run Docker — it's free. ARP Cloud (our hosted runtime) has a free tier.
Paid tiers kick in when you need higher message volume.

## Can I self-host?

Yes. The sidecar Docker image (`ghcr.io/kybernesisai/sidecar`) is the
reference self-host. It runs on any VPS that supports Docker. The
owner app (the dashboard you use to manage your agent) runs anywhere
Node.js 24 runs.

## What languages do you support?

TypeScript is the reference SDK. A Python SDK is in the repo (basic
shape complete, Cedar evaluation + DIDComm transport to land at v1.1).
Go + Rust are community-contributed after launch.

## Which agent frameworks work with ARP today?

Five reference adapters ship at v1.0: KyberBot, OpenClaw, Hermes-Agent,
NanoClaw, and LangGraph. The `create-adapter` CLI helps you write one
for any other framework — we cover every structural shape we've seen.

## What about LLM tool use?

ARP operates at a layer above tool calls. Your agent decides internally
what tools to invoke — ARP handles what happens when your agent decides
to delegate a task to a different agent over the wire.

## How does identity work?

Every agent has a domain like `samantha.agent`. The owner (the human,
or the company) has an identity that's separate from the agent's
identity — you can transfer ownership without changing the agent's
name. For users who don't want to bother with crypto, we offer a
"Generated for you" path on signup where the cloud manages the
identity in a user-friendly way.

## What about revocation?

Revocation is instant. When you revoke a connection (or an owner
revokes their agent's access), the next message bounces with a clear
403 and an auditable record. No 60-second propagation windows, no
stale caches.

## How do you handle compliance?

We ship an `npx @kybernesis/arp-testkit audit <domain>` CLI that runs
11 probes against any `.agent` domain and tells you which ones pass.
It's the same tool we run in CI against every reference agent.

## Is ARP secure?

"Secure" always depends on the threat model. ARP's answers:

- Principal private keys live on the user's device. The cloud never
  sees them.
- Transport is signed + DIDComm-enveloped over DID-pinned TLS. Classic
  MITM attacks don't work against a properly configured agent.
- Every audit entry is signed + hash-chained — you can detect a
  tampered log in constant time.
- Policy evaluation uses Cedar, which has a well-studied semantics +
  an audited reference implementation.
- The reference sidecar image is ≤ 300 MB and runs as a non-root user
  with `tini` PID 1.

For a red-team review, the repo is open. Issues + responsible
disclosures welcome.

## What's the license?

MIT. All code, all docs, all schemas, all scope templates.

## When does v1.0 ship?

Packages are at v1.0 at launch. The **spec** is versioned separately at
v0.1 — public review means the spec will move before it freezes at v1.0.
Breaking changes go through the RFC process.

## How do I contribute?

Read [github.com/KybernesisAI/arp](https://github.com/KybernesisAI/arp).
File issues. Propose RFCs. Write adapters. The community governance
model is "maintainer consensus" for the first year, with a formal
governance transition planned as the community grows.

## Where are you based?

Bangkok. Business hours are Asia/Bangkok. Async-friendly; we'll take
questions on GitHub Discussions on any timezone.

## How do I get support?

- **Community:** GitHub Discussions is the primary channel.
- **Issues + bugs:** GitHub Issues.
- **Security disclosures:** [TODO: Ian — set up security@arp.run alias
  + post the PGP key publicly before launch].
- **Paid support:** available for ARP Cloud paid tiers.

## Are you hiring?

Not actively, but if you've got deep Cedar, DIDComm, or protocol-design
experience and this project resonates — ian@darkstarvc.com.
