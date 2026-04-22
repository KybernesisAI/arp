# ARP — Installation, Hosting & Agent Integration

**Purpose:** explain how ARP actually gets installed onto real agents (OpenClaw, Hermes-Agent, NanoClaw, KyberBot, Samantha, and customs) and where the owner UI runs.

---

## 1. The design constraint

Agents come in radically different shapes:

| Agent type | Examples | Topology |
|---|---|---|
| Hosted SaaS agent | OpenClaw, hosted Hermes | Someone else's cloud, limited runtime access |
| Self-hosted server agent | KyberBot, self-hosted OpenClaw | Your own VPS / k8s / Docker host |
| Desktop / local agent | Samantha on a Mac, NanoClaw locally | User's machine, intermittent, maybe no static IP |
| Framework-based agent | LangGraph workflows, CrewAI crews | Library inside another app |
| MCP server | Tool servers | Stateless request/response, not autonomous |
| Mobile agent | On-device phone agent | Intermittent, sandboxed |

A single install method can't cover all six. The protocol must be consistent — the install path must be plural.

**Core principle:** the outside world cannot tell which install method an agent used. The wire format (DIDComm + well-known docs + Connection Tokens) is identical. Install mode is an internal deployment choice.

---

## 2. The handoff bundle — the "install artifact"

When a buyer completes registration at `.agent` and ticks "Set up as ARP agent," the registrar emits a **Handoff Bundle** — a single portable file (JSON or signed zip) that encodes everything needed to activate the agent under ARP.

```json
{
  "arp_version": "0.1",
  "agent_did": "did:web:kyberbot.agent",
  "principal_did": "did:web:ian.self.xyz",
  "keypair": {
    "public_key_multibase": "z6Mk...",
    "private_key_handle": "ref://wallet/key-1"
  },
  "well_known_urls": {
    "did": "https://kyberbot.agent/.well-known/did.json",
    "agent_card": "https://kyberbot.agent/.well-known/agent-card.json",
    "arp": "https://kyberbot.agent/.well-known/arp.json",
    "revocations": "https://ian.kyberbot.agent/.well-known/revocations.json"
  },
  "owner_subdomain": "ian.kyberbot.agent",
  "registrar": {
    "name": "Headless Domains",
    "api_base": "https://api.headlessdomains.com/v1",
    "api_key_ref": "ref://wallet/registrar-key"
  },
  "scope_catalog_version": "v1",
  "bootstrap_token": "eyJhbGciOiJFZERTQSJ9...",   // 15-min exp, scopes arp-sdk takeover
  "hosting_defaults": {
    "well_known_host": "https://host.headlessdomains.com/kyberbot.agent"
  },
  "install_guides": {
    "cloud":   "https://arp.spec/install/cloud/v0.1",
    "sidecar": "https://arp.spec/install/sidecar/v0.1",
    "library": "https://arp.spec/install/library/v0.1"
  }
}
```

Think of this as a `.mobileconfig` for iOS or an `.ovpn` for VPNs — a portable, self-contained install artifact. The buyer either uploads it into our owner app, passes it to our CLI, or drops it into their agent's config directory.

---

## 3. Three install modes

All three produce an identical external wire presence. Choose by topology, not by protocol.

### 3.1 Mode A — Cloud-hosted (SaaS on our side)

**One-line pitch:** you change one DNS A record; we handle everything else.

**Topology:**
```
[Outside agents] ──HTTPS / DIDComm──▶ [arp.cloud runtime] ──proxy──▶ [Your agent's API]
                                             │
[Owner browser / mobile] ──HTTPS──▶  ───┘
```

**What the buyer does:**
1. In the owner app, paste the Handoff Bundle (or OAuth into the registrar which hands it over).
2. Provide an HTTPS endpoint where their agent accepts requests.
3. Point `kyberbot.agent` A record at `arp.cloud`'s IP (automatic via registrar API).

**What we handle:**
- Well-known hosting
- DIDComm mailbox
- Cedar PDP
- Connection registry
- Audit log
- Revocations endpoint
- Per-connection memory isolation (via a proxy layer)
- x402 settlement
- TLS certs

**Pros:** zero install, works for any agent type, good for non-technical buyers.
**Cons:** we see their traffic metadata (encrypted bodies aren't visible, but who-talks-to-whom is); their data-residency choices are ours.

**When to pick:** hosted SaaS agents, consumer users, anyone who prefers SaaS.

### 3.2 Mode B — Sidecar (Docker / systemd)

**One-line pitch:** run our runtime as a separate process next to your agent.

**Topology:**
```
┌──────── Your host / k8s pod / VM ────────┐
│                                          │
│   [Your agent]  ◀───localhost HTTP───▶  [ARP sidecar]
│                                          │
└──────────────────────────────────────────┘
                              ▲
                              │ HTTPS / DIDComm (443)
                              │
                    [Outside agents]
```

**Install:**
```bash
# from the Handoff Bundle directory
docker run -d \
  --name arp-sidecar \
  -p 443:443 \
  -v $(pwd)/handoff.json:/config/handoff.json:ro \
  -v arp-data:/data \
  -e AGENT_API_URL=http://host.docker.internal:8080 \
  ghcr.io/kybernesisai/sidecar:0.1
```

Or via `systemd` unit file we ship. Or Helm chart. Or Fly / Railway one-click template.

**What the sidecar handles:**
- All ARP runtime (same as cloud mode)
- Local API on `127.0.0.1:7877` that your agent calls to: check permission, log action, receive inbound DIDComm messages

**What your agent does:**
Your agent needs **five integration points** with the sidecar (same for any framework):

```ts
// Before any outbound action:
await arp.request({ action, resource, context });  // → { allow, obligations }

// Before exposing data externally:
await arp.egress({ data, connection_id });         // → redacted data

// Receiving a new task from a peer agent:
arp.onIncoming((task) => { /* handle */ });

// Log significant events:
await arp.audit({ event, connection_id });

// Respond to revocation notifications:
arp.onRevocation((conn_id) => { /* drop state */ });
```

**Pros:** full sovereignty over data and code; no dependency on our infra; works offline-ish (with caveats on inbound DIDComm).
**Cons:** requires internet-accessible host with a real IP or tunnel (Tailscale Funnel, Cloudflare Tunnel, ngrok) for inbound DIDComm.

**When to pick:** self-hosted agents, enterprise deployments, privacy-max users, most server-side custom agents.

### 3.3 Mode C — Library (embedded SDK)

**One-line pitch:** `npm install @arp/sdk` and add ~20 lines of code.

**Topology:**
```
┌──────── Your agent process ─────────┐
│                                      │
│   [Your agent code]                  │
│        │                             │
│        └─▶ @arp/sdk (in-process)     │
│                │                     │
└────────────────┼─────────────────────┘
                 ▼ HTTPS / DIDComm (443)
           [Outside agents]
```

**Install (Node.js / TS):**
```bash
npm install @arp/sdk
```

```ts
import { ArpAgent } from '@arp/sdk';
import handoff from './handoff.json';

const agent = await ArpAgent.fromHandoff(handoff, {
  onIncoming: async (task, ctx) => {
    // Your agent logic here; `ctx` carries the PDP decision and connection info
    return yourAgent.handle(task);
  },
});

await agent.start({ port: 443 });

// Elsewhere — guard outbound actions:
const { allow, obligations } = await agent.pdp.check({ action, resource });
if (!allow) throw new Error('ARP denied');
```

Same pattern in Python via `pip install arp-sdk`.

**Pros:** tightest integration; lowest latency; shared process state; best DX for greenfield agents.
**Cons:** runtime-coupled to TS or Python; upgrades require a redeploy; can't be swapped without code change.

**When to pick:** custom agents you control end-to-end (KyberBot, Samantha), new agents being built greenfield, framework-based agents where you're writing the code.

---

## 4. Framework adapters

For popular agent frameworks, we ship **adapter packages** that wrap the sidecar or library pattern in framework-specific idioms. A user of OpenClaw doesn't learn ARP primitives — they install the adapter and flip a config flag.

| Framework | Package | Pattern | What it exposes |
|---|---|---|---|
| **OpenClaw** | `@arp/adapter-openclaw` | sidecar-aware plugin | `openclaw.use(arpPlugin({ handoff }))` |
| **Hermes-Agent** | `@arp/adapter-hermes` | middleware | auto-wraps every tool call |
| **NanoClaw** | `@arp/adapter-nanoclaw` | decorator | `@arp_guarded` on tool handlers |
| **KyberBot** | `@arp/adapter-kyberbot` | native integration | hooks into KyberBot's permission layer directly |
| **LangGraph** | `@arp/adapter-langgraph` | graph node | drop-in ARP node between state transitions |
| **CrewAI** | `@arp/adapter-crewai` | crew-level wrapper | every agent in the crew speaks ARP |
| **MCP** | `@arp/adapter-mcp` | server wrapper | turns any MCP server into an ARP-guarded endpoint |

Each adapter is ~500 lines of code and presents the five integration points (§3.2) in the idiom the framework's users already know.

**Adapters are separate packages, maintained separately from the core SDK.** A framework version bump doesn't block the SDK. Community-maintained adapters are welcome.

---

## 5. Install walkthroughs

### 5.1 KyberBot (custom server-side agent you control)

Recommended: **Mode C (library)** if you're on TS/Python, **Mode B (sidecar)** otherwise.

```bash
# 1. Buy kyberbot.agent, tick "ARP-ready"
# 2. Download handoff.json from the owner app (or email)
# 3. Install the adapter
npm install @arp/sdk @arp/adapter-kyberbot

# 4. In your KyberBot entry point:
```
```ts
import { KyberBot } from 'kyberbot';
import { withArp } from '@arp/adapter-kyberbot';
import handoff from './config/arp-handoff.json';

const bot = withArp(new KyberBot({ /* your config */ }), { handoff });
await bot.start();
```
```bash
# 5. DNS: A record of kyberbot.agent → your server IP
#    Already done if you used the registrar's one-click.
# 6. Done — kyberbot.agent is now pairable via the owner app.
```

### 5.2 Samantha (personal agent running on a Mac)

Recommended: **Mode B (sidecar)** via Docker Desktop + Cloudflare Tunnel.

```bash
# 1. Install Docker Desktop if not already
# 2. Drop handoff.json into ~/.arp/
# 3. Start the sidecar:
docker run -d --name samantha-arp \
  -v ~/.arp/handoff.json:/config/handoff.json:ro \
  -v arp-data:/data \
  -e AGENT_API_URL=http://host.docker.internal:9000 \
  ghcr.io/kybernesisai/sidecar:0.1

# 4. Cloudflare Tunnel to expose samantha.agent:443 to the internet:
cloudflared tunnel --name samantha --url http://localhost:443
# (One-time: log into CF, point samantha.agent DNS at the tunnel via the registrar)

# 5. Owner app available at https://ian.samantha.agent
```

### 5.3 OpenClaw (hosted SaaS)

Recommended: **Mode A (cloud)** — you can't run a sidecar inside their infra anyway.

```bash
# 1. Buy openclaw-ian.agent
# 2. In arp.cloud owner app:
#    - Paste the handoff bundle
#    - Enter your OpenClaw agent's API URL + auth token
#    - Click "Provision"
# 3. arp.cloud now fronts openclaw-ian.agent, proxies traffic to OpenClaw.
#    Every OpenClaw action is guarded by the PDP before reaching the real agent.
```

### 5.4 LangGraph custom agent

Recommended: **Mode C (library)** via the LangGraph adapter.

```ts
import { StateGraph } from '@langchain/langgraph';
import { arpNode } from '@arp/adapter-langgraph';
import handoff from './handoff.json';

const graph = new StateGraph(...)
  .addNode('arp_guard', arpNode({ handoff }))
  .addEdge('plan', 'arp_guard')
  .addEdge('arp_guard', 'act')
  .compile();
```

The `arp_guard` node calls the PDP between planning and acting; denied actions trigger an obligation-handling branch.

---

## 6. Where the owner UI runs

Not localhost-only. Not cloud-only. The architecture allocates UI by concern:

### 6.1 Authoritative owner app → **owner subdomain**

The canonical owner app runs at `ian.samantha.agent` (the owner subdomain). This gives it:
- A stable HTTPS URL tied to the owner's identity
- Natural cryptographic proof of ownership (same keys that signed the Representation VC)
- No dependency on a centralized SaaS
- TLS cert included in the per-agent ACME setup

**In Mode A (cloud):** we host the owner app at the owner subdomain; it looks like it's on the owner's domain but is actually a Vercel deployment we run.

**In Mode B (sidecar):** the sidecar includes the owner app as a bundled route at `/owner`. The owner subdomain CNAMEs to the sidecar.

**In Mode C (library):** the SDK exposes the owner-app routes as mountable middleware.

**Result:** whatever mode you chose, your owner app URL is `https://ian.{your-agent}.agent`. Universal.

### 6.2 Mobile companion → **native app (iOS + Android)**

A native app is necessary for three things the web can't do well:
- Push notifications for pending consent
- Biometric confirmation for `step_up_required` scopes
- QR-scan pairing

We ship one app. It talks to your agent runtime over DIDComm (using your principal DID to auth). Same app works with any ARP-compliant agent — it's not tied to our runtime.

The mobile app does **not** replace the owner subdomain app — it's a companion. Critical flows (pairing approval, revocation, audit review, re-consent prompts) work on both.

### 6.3 Offline / air-gapped case

If an owner wants no internet-exposed UI, they can run the owner app purely on LAN (Mode B, sidecar on localhost). The agent runtime still needs an internet-facing endpoint for DIDComm, but the owner UI can be LAN-only.

The mobile app then uses local network discovery (Bonjour/mDNS) to find the owner app when on the same Wi-Fi, and is offline elsewhere.

### 6.4 The third option — pure SaaS at `app.arp.spec`

For people who haven't yet installed anything or whose install broke: a fallback web app at `app.arp.spec`. Log in with your principal DID (sign a challenge with your key). It connects to whatever owner subdomain you own and provides the same UI. Useful for recovery, first-time setup before DNS propagates, or accessing your agent from a borrowed machine.

---

## 7. Tradeoff matrix (which mode for which agent)

| Criterion | Mode A (cloud) | Mode B (sidecar) | Mode C (library) |
|---|---|---|---|
| Install difficulty | ★☆☆☆☆ | ★★☆☆☆ | ★★★☆☆ |
| Data sovereignty | ★★☆☆☆ | ★★★★★ | ★★★★★ |
| Works with any agent | ★★★★★ | ★★★★★ | ★★★☆☆ (TS/Python) |
| Inbound DIDComm without tunnel | ★★★★★ | ★☆☆☆☆ | ★☆☆☆☆ |
| Runtime overhead | ★★★★★ (remote) | ★★★☆☆ (process) | ★★★★★ (in-proc) |
| Latency to PDP | ★★☆☆☆ (network) | ★★★★☆ (localhost) | ★★★★★ (in-proc) |
| Upgrade independence | ★★★★★ (we push) | ★★★★☆ (pull image) | ★★☆☆☆ (redeploy) |
| Best for | SaaS agents, consumers | Self-hosted, enterprise | Custom greenfield |

---

## 8. The agent's five integration points (universal)

Regardless of install mode, every agent eventually hits the same five seams. Each adapter implements these:

1. **Permission check (inbound):** before handling an incoming peer request.
   `arp.check({ action, resource, context, connection_id })` → `{ allow, obligations }`
2. **Permission check (outbound):** before taking an action on behalf of the owner.
   Same shape.
3. **Egress filter:** after generating a response, before sending.
   `arp.egress({ data, connection_id, obligations })` → `data_redacted`
4. **Audit log:** record significant events.
   `arp.audit({ event, connection_id, metadata })`
5. **Lifecycle events:** handle revocation, rotation, new-pairing notifications.
   `arp.on('revocation' | 'rotation' | 'pairing', handler)`

Adapters wrap these in framework idioms. An OpenClaw user sees a plugin; a LangGraph user sees a graph node; a KyberBot user sees a native permissions hook.

---

## 9. Distribution & updates

- **Docker images:** published to GHCR under the `KybernesisAI` org. Tagged `ghcr.io/kybernesisai/sidecar:0.1`, `:latest`, etc.
- **NPM packages:** `@arp/sdk`, `@arp/adapter-*` under our org. Semver.
- **Python packages:** `arp-sdk`, `arp-adapter-*` on PyPI. Semver.
- **Mobile apps:** App Store + Play Store under the ARP spec organization.
- **Install guides:** permanent versioned URLs under `arp.spec/install/*/v<version>`.
- **Handoff bundle format:** versioned per `arp-spec` release.

Updates:
- Sidecar: `docker pull` + restart. Stateless except for registry, which has a migration runner.
- SDK: bump version, redeploy the host app.
- Cloud: we push silently; customers pinned to a version upgrade on schedule.

---

## 10. Operational minimums

What every agent needs, regardless of mode:

- A stable internet-facing HTTPS endpoint at `agent-name.agent:443` (direct IP, tunnel, or cloud proxy — all fine)
- A valid TLS cert (automatic via Let's Encrypt during registration)
- Persistent storage for the Connection registry and audit log (≥1 GB for an active agent)
- Clock sync (NTP) — token expirations and audit ordering rely on reasonably accurate time

What they don't need:
- A static public IP (tunnels work)
- A hosted server if using Mode A
- Any specific programming language if using Mode A or B
- Any ARP-specific hardware

---

## 11. FAQ

**Q: Can I switch install modes later?**
Yes. The handoff bundle is portable. Switch by re-pointing DNS and restarting. Connections persist because they're signed against the agent DID, not the hosting.

**Q: What if my agent framework isn't listed?**
Use Mode B (sidecar) — it's framework-agnostic by design. Or build an adapter; ~500 lines of TS/Python.

**Q: Can two agents on the same host share one sidecar?**
Yes. The sidecar supports multiple agent DIDs if you pass multiple handoff bundles. One process, many agents.

**Q: What happens to my connections if I migrate hosts?**
Nothing — connections bind to the agent DID, not the hosting. Move the data volume (or restore from backup); connections pick up where they left off.

**Q: Do I need the cloud SaaS if I'm self-hosting?**
No. Mode B or C is fully self-sufficient. The cloud is a convenience, not a dependency.

**Q: What if the buyer has no technical skill at all?**
Mode A (cloud) with a hosted partner agent (e.g., OpenClaw) is genuinely zero-install. Pay, pick, done.

---

## 12. Summary — answering the original question

- **Installation is plural**, not a single path. Three modes (cloud / sidecar / library) + adapter packages for popular frameworks. Choose by your agent's topology, not by our preference.
- **The handoff bundle** (emitted by the registrar at purchase time) is the universal install artifact — one file, works with any mode.
- **The owner UI lives at the owner subdomain** (`ian.samantha.agent`) in all three modes. Mobile companion app for notifications, biometrics, and QR pairing. A fallback SaaS at `app.arp.spec` for recovery and first-time setup.
- **Not localhost only** and **not SaaS only** — a hybrid where the UI URL is stable across deployment topologies.
- **Framework adapters** mean most agent users never learn ARP directly — they install the adapter for their framework and keep writing their agent code the way they always have.
