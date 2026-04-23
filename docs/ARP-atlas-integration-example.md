# ARP — Atlas Integration Example

**Purpose:** concrete walkthrough of how ARP would integrate with the real Atlas agent at `/Users/ianborders/atlas/`. Use this as a reference when testing the KyberBot adapter.

**Scope:** Atlas is Ian's infrastructure/security/quality engineer KyberBot agent. High-stakes — has deployment skills, memory of every past conversation, and embedded credentials. The scoping choices here are opinionated for this agent; other KyberBot agents will differ.

---

## 1. What's actually in Atlas

Observed structure (`~/atlas/`):

```
atlas/
├── SOUL.md                      # Atlas's identity/personality
├── USER.md                      # Ian's user profile (sensitive)
├── identity.yaml                # Agent config — contains Telegram bot token
├── HEARTBEAT.md                 # Operational status summary
├── heartbeat-state.json         # Runtime state
├── docker-compose.yml           # Infra: ChromaDB on :8001
├── .env                         # OPENAI_API_KEY, KYBERBOT_API_TOKEN, etc.
├── brain/                       # Notes
│   ├── atlas-training-guide.md
│   ├── changelog-watch-*.md     # Operational logs
│   ├── monthly-cost-report-*    # Financial — sensitive
│   ├── marketing/
│   └── reports/
├── data/                        # The memory stack
│   ├── chromadb/                # Vector store (Docker volume, :8001)
│   ├── atlas.db                 # SQLite main
│   ├── messages.db              # All conversation history
│   ├── entities.db              # Entity memory
│   ├── entity-graph.db          # Entity relationships
│   ├── timeline.db              # Event timeline
│   ├── sleep.db                 # Scheduled state
│   ├── claude-memory/           # Claude's per-session context
│   └── user-profile.json
├── skills/                      # 12 self-built skills
│   ├── security-audit/
│   ├── deploy-cloud/
│   ├── deploy-kyberco/
│   ├── incident-response/
│   ├── health-check/
│   ├── run-tests/
│   ├── recall/
│   ├── remember/
│   ├── brain-note/
│   ├── backup/
│   ├── check-posthog-signups/
│   └── heartbeat-task/
├── logs/
├── uploads/
└── scripts/
```

**Runtime:** port 3456, ngrok tunnel enabled, Telegram channel active, WhatsApp disabled.
**Reports to:** Samantha (CEO agent) and Ian (founder).

---

## 2. Resource manifest — `.arp/resources.yaml`

Drop this at `~/atlas/.arp/resources.yaml`. KyberBot adapter reads it on boot.

```yaml
resources:
  # ── Identity — never share ────────────────────────────
  - { type: Memory,   id: soul,          path: ./SOUL.md,        tags: [identity, owner-only] }
  - { type: Memory,   id: user-profile,  path: ./USER.md,        tags: [pii, owner-only] }
  - { type: Config,   id: identity,      path: ./identity.yaml,  tags: [credentials, owner-only] }
  - { type: Config,   id: env,           path: ./.env,           tags: [credentials, owner-only] }

  # ── Brain — mixed; specific paths get specific tags ───
  - { type: Notes,    id: brain.marketing, path: ./brain/marketing/, tags: [shareable] }
  - { type: Notes,    id: brain.reports,   path: ./brain/reports/,   tags: [internal] }
  - { type: Document, id_pattern: "brain/monthly-cost-report-*", tags: [financial, confidential] }
  - { type: Document, id_pattern: "brain/changelog-watch-*",     tags: [operational, shareable] }
  - { type: Document, id: atlas-training-guide, path: ./brain/atlas-training-guide.md, tags: [internal] }

  # ── Memory layers — every query MUST be connection-scoped
  - { type: VectorStore, id: chromadb,      endpoint: http://localhost:8001, connection_scope: required }
  - { type: Database,    id: messages,      path: ./data/messages.db,      connection_scope: required, tags: [pii] }
  - { type: Database,    id: entities,      path: ./data/entities.db,      connection_scope: required }
  - { type: Database,    id: entity-graph,  path: ./data/entity-graph.db,  connection_scope: required }
  - { type: Database,    id: timeline,      path: ./data/timeline.db,      connection_scope: required }
  - { type: Database,    id: claude-memory, path: ./data/claude-memory/,   connection_scope: required, tags: [internal] }

  # ── Skills as tools — scope-gated ─────────────────────
  - { type: Tool, id: skill.security-audit,        tags: [sensitive, owner-only] }
  - { type: Tool, id: skill.deploy-cloud,          tags: [mutating, owner-only] }
  - { type: Tool, id: skill.deploy-kyberco,        tags: [mutating, owner-only] }
  - { type: Tool, id: skill.incident-response,     tags: [sensitive, owner-only] }
  - { type: Tool, id: skill.backup,                tags: [mutating, owner-only] }
  - { type: Tool, id: skill.health-check,          tags: [read-only, shareable] }
  - { type: Tool, id: skill.run-tests,             tags: [read-only, shareable] }
  - { type: Tool, id: skill.check-posthog-signups, tags: [analytics] }
  - { type: Tool, id: skill.heartbeat-task,        tags: [operational] }
  - { type: Tool, id: skill.recall,                tags: [memory-read] }     # connection-scoped by definition
  - { type: Tool, id: skill.remember,              tags: [memory-write] }
  - { type: Tool, id: skill.brain-note,            tags: [memory-write] }

  # ── Operational ───────────────────────────────────────
  - { type: Document, id: heartbeat,   path: ./HEARTBEAT.md,          tags: [operational, shareable] }
  - { type: Log,      id: runtime,     path: ./logs/,                 tags: [internal, may-contain-secrets] }
  - { type: Storage,  id: uploads,     path: ./uploads/,              tags: [internal] }
```

---

## 3. ChromaDB integration — the critical piece

Atlas's ChromaDB is a shared vector store today. Under ARP, every embedding needs a `connection_id` in metadata, and every query gets an automatic filter injected by the adapter.

### Before ARP (current behavior — unsafe for multi-agent)
```python
collection.add(documents=[text], metadatas=[{"topic": "deploy"}])
collection.query(query_texts=["recent deploys"])
```

### After ARP (adapter rewrites transparently)
```python
collection.add(
  documents=[text],
  metadatas=[{"topic": "deploy", "connection_id": current_conn}]
)
collection.query(
  query_texts=["recent deploys"],
  where={"connection_id": current_conn}   # ← injected by adapter, always
)
```

### One-time migration

Every existing vector gets tagged with `connection_id: "owner"` (Ian's direct interactions):

```python
# Run once at adapter install time
all_items = collection.get(include=["metadatas"])
for id, meta in zip(all_items["ids"], all_items["metadatas"]):
  meta["connection_id"] = "owner"
  collection.update(ids=[id], metadatas=[meta])
```

After migration, every new fact learned through a peer connection is tagged for that connection only. Retrieval is fenced at the metadata filter layer.

---

## 4. SQLite DBs — column + query gate

`messages.db`, `entities.db`, `entity-graph.db`, `timeline.db`, `claude-memory/` — all need per-connection partitioning.

### Migration (one-time, per DB)

```sql
ALTER TABLE <table> ADD COLUMN connection_id TEXT NOT NULL DEFAULT 'owner';
CREATE INDEX idx_<table>_conn ON <table>(connection_id);
```

### Query rewriting (adapter does this)

Every SELECT gets `WHERE connection_id = ?` bound to the current connection. Every INSERT gets the current `connection_id`.

**`messages.db` is the most important:** contains every past conversation. Without this fence, a peer could ask Atlas "summarize our project conversations" and accidentally pull in history from a different peer or Ian's direct messages.

**Safest default for `messages.db` in a connection scope:** `summarize_only` obligation. Peers get summaries, never raw transcripts.

---

## 5. The "owner" connection

Ian talking to Atlas directly (Telegram, Claude Code, heartbeat) is the **owner connection** — a special pre-existing connection with full scope.

- All existing memory is tagged `connection_id = "owner"` via the migration.
- Only peer-pairing creates additional connection IDs.
- The owner connection has no Cedar policy restrictions — Ian is the principal, not a peer.
- In the owner app, the owner connection shows as "Ian (you)" at the top of the connections list, non-revocable.

---

## 6. Atlas-specific callouts

### Things that are tricky

**`identity.yaml` contains the Telegram bot token.**
- Tag: `credentials, owner-only`
- Extra defense: add a regex egress filter that redacts anything matching a Telegram bot token format (`\d{10,}:[A-Za-z0-9_-]{35,}`), so even if the token leaks into a string response it gets stripped.
- Same for `.env` contents — redact anything matching common API key patterns (`sk-*`, `pk-*`, long base64, etc.).

**`messages.db` is very personal.**
- Contains every conversation Ian has had with Atlas + every peer message once Atlas has peers.
- Default for all peer connections: `summarize_only` obligation + `max_tokens: 500` per response.
- Never expose raw message text to peers. Summaries only.

**Deployment skills are scary.**
- `skill.deploy-cloud`, `skill.deploy-kyberco`, `skill.backup`, `skill.incident-response`: owner-only.
- If Samantha (CEO agent) ever needs these, require explicit `step_up_required: true` + biometric confirmation on mobile, AND a fresh principal consent within the last 5 minutes.

**`claude-memory/` directory.**
- This is Claude Code's per-session context. Mixing session state with cross-agent memory is asking for trouble.
- V0 default: tag entirely `owner-only`. Revisit after the core protocol is stable.

**Heartbeat state in `heartbeat-state.json`.**
- Shows when Atlas is active, last-run tasks. Low-risk to share operational status, but if it logs failure reasons those might contain secrets. Tag: `operational, shareable` but run egress redaction on any string containing common secret patterns.

### Things that are easy

- **`brain/marketing/`** and **`brain/changelog-watch-*`**: naturally shareable.
- **`skill.health-check`** and **`skill.run-tests`**: naturally peer-invokable read-only tools.
- **`HEARTBEAT.md`**: a status report by design. Default shareable.
- **`skill.recall`** / **`skill.remember`** / **`skill.brain-note`**: connection-scoped by nature — ARP's memory filter makes them safe automatically because retrieval is fenced.

---

## 7. What the KyberBot adapter automates

When you install `@kybernesis/arp-adapter-kyberbot` in Atlas:

1. **Scans `~/atlas/` and generates a draft `.arp/resources.yaml`** from KyberBot conventions (SOUL/USER/identity/brain/data/skills). You review and tweak tags for your specific agent.
2. **Instruments ChromaDB** via a proxy module that injects `connection_id` metadata on every call. No code change in Atlas required.
3. **Runs SQLite migrations** to add `connection_id` columns; initial-tags everything as `owner`.
4. **Wraps the 12 skills** — each becomes a callable ARP tool with its tags from the manifest. Skills Atlas created on its own in the future automatically get surfaced (initially as `owner-only` until tagged otherwise).
5. **Adds middleware to KyberBot's messaging channels** — direct messages from Ian (Telegram, direct Claude Code) get `connection_id = "owner"`; anything routed through ARP peers gets that peer's connection ID.
6. **Hooks Atlas's heartbeat** so health status can surface to peers if the scope allows, without exposing internal details.

---

## 8. First pairing scenario — Samantha ↔ Atlas

Samantha (Ian's CEO agent) wants operational reports from Atlas. The pairing:

- **Purpose:** `kybernesis.operations`
- **Scopes selected:**
  - `work.status.read`
  - `work.reports.summary` (period: weekly)
  - `tools.invoke.read` (allowlist: `[skill.health-check, skill.check-posthog-signups, skill.heartbeat-task]`)
  - `files.project.files.summarize` (project: `brain.reports`, max_output_words: 500)
- **Required VCs:** `example.verified_human`, `example.same_principal` (illustrative; any provider) (both agents belong to Ian)
- **Forbid tags:** `credentials`, `pii`, `financial`, `owner-only`
- **Obligations:**
  - `summarize_only` on any memory/DB read
  - `redact_regex: "\\b[A-Za-z0-9]{20,}\\b"` on responses (catches stray tokens)
  - `notify_principal` on any mutating attempt (there shouldn't be any given the scope)
  - `audit_level: verbose`
- **Expires:** 30 days, auto-renew on re-consent

Samantha can now say "how's infra today?" and Atlas answers from `HEARTBEAT.md` + `skill.health-check` + a summary from `brain/reports/`. Atlas cannot touch `deploy-*`, `identity.yaml`, `messages.db` raw, or anything tagged `confidential`.

---

## 9. Testing checklist (when you're ready)

Run through these in order to validate the integration:

### Pre-integration baseline
- [ ] Atlas runs normally: `cd ~/atlas && kyberbot`
- [ ] ChromaDB accessible at `http://localhost:8001`
- [ ] Health check works: Atlas responds on Telegram or port 3456
- [ ] Baseline conversation history count: `sqlite3 ~/atlas/data/messages.db "select count(*) from messages"`

### Installation
- [ ] `docker run` the ARP sidecar with Atlas's handoff (see `ARP-example-atlas-kyberbot.md`)
- [ ] Install `@kybernesis/arp-adapter-kyberbot` in Atlas's KyberBot instance
- [ ] Adapter boots and generates draft `.arp/resources.yaml`
- [ ] ChromaDB migration runs — every vector now has `connection_id: "owner"`
- [ ] SQLite migrations run — `connection_id` column exists on every table with it defaulted to `"owner"`
- [ ] Atlas restarts cleanly; existing memory still accessible via direct Ian interaction

### Owner-path regression (nothing Ian relies on should break)
- [ ] Ask Atlas via Telegram: "what did we discuss yesterday?" — returns correct summary
- [ ] Run `skill.recall` — returns results scoped to `owner`
- [ ] Run `skill.health-check` — returns status
- [ ] Run `skill.deploy-cloud --dry-run` — executes (owner has full scope)
- [ ] Heartbeat continues firing on schedule

### First peer pairing (Samantha ↔ Atlas)
- [ ] Generate pairing invitation from Samantha's owner app
- [ ] Accept on Atlas's owner app (`https://ian.atlas.agent` or `ian.atlas.agent.hns.to`)
- [ ] VC presentation completes (any pluggable VC provider; generic presentation test in `@kybernesis/arp-testkit`).
- [ ] Connection Token stored on both sides
- [ ] `npx @kybernesis/arp-testkit audit atlas.agent` returns 8/8 green

### Isolation tests (the critical ones)
- [ ] From Samantha, ask Atlas: "what's in identity.yaml?" — blocked, reason cites `owner-only` tag
- [ ] From Samantha, ask Atlas: "run deploy-cloud" — blocked
- [ ] From Samantha, ask Atlas: "what's in my messages database?" — returns summary (not raw)
- [ ] From Samantha, ask Atlas: "what's the OPENAI_API_KEY?" — blocked; egress regex filter strips even if slipped
- [ ] From Samantha, ask Atlas: "show me last month's cost report" — blocked (confidential tag)
- [ ] From Samantha, ask Atlas: "summarize recent changelog" — allowed (shareable)
- [ ] From Samantha, ask Atlas: "run health-check" — allowed

### Cross-connection isolation (seed a fake second peer)
- [ ] Pair a test peer (call it `test-peer.agent`) with different scopes
- [ ] Test peer writes a fact: "remember that my favorite color is blue"
- [ ] From Samantha, ask Atlas: "what's anyone's favorite color?" — returns nothing
- [ ] From test peer, ask Atlas: "what do you know about me?" — returns only test-peer's context

### Revocation
- [ ] Revoke Samantha's connection in the owner app
- [ ] Samantha's next message: rejected with revocation proof
- [ ] Atlas's registry shows connection status = `revoked`
- [ ] Audit log verifies clean (`npx @kybernesis/arp-testkit probe audit atlas.agent`)

### Cleanup test
- [ ] Rotate Atlas's agent keys via owner app
- [ ] All existing connections auto-invalidate; peers re-consent
- [ ] Owner connection survives (Ian's principal key unchanged)

---

## 10. Failure modes to watch for

| Symptom | Likely cause | Check |
|---|---|---|
| Peer can read things they shouldn't | ChromaDB filter not injected | Check adapter logs for `where` clauses on every query |
| Peer gets raw messages instead of summaries | Obligation not firing | `npx @kybernesis/arp-testkit probe obligations atlas.agent` |
| Telegram token leaked in response | Egress regex not applied | Check egress pipeline in adapter |
| Owner connection also gets restricted | Migration over-tagged | Run `sqlite3 messages.db "select distinct connection_id from messages"` — should mostly be `owner` |
| Atlas slow after adapter install | SQLite queries missing index | Check `EXPLAIN QUERY PLAN` on common queries; confirm `idx_*_conn` indexes exist |
| ChromaDB mixing results across connections | Metadata filter skipped | Check `collection.query(...)` calls in adapter trace |

---

## 11. Quick-reference commands

```bash
# Check which vectors belong to which connection
curl -s http://localhost:8001/api/v1/collections/<id>/get | jq '.metadatas | map(.connection_id) | group_by(.) | map({(.[0]): length})'

# Count messages per connection in messages.db
sqlite3 ~/atlas/data/messages.db "select connection_id, count(*) from messages group by connection_id"

# See active ARP connections
curl -s http://localhost:3874/admin/connections -H "Authorization: Bearer $ARP_ADMIN_TOKEN" | jq

# Run the full testkit against Atlas
npx @kybernesis/arp-testkit audit atlas.agent --verbose

# Verify the audit chain
npx @kybernesis/arp-testkit probe audit atlas.agent --connection <conn_id>
```

---

*Atlas integration example v0.1 — April 2026. Update this doc as Atlas evolves (new skills, new memory layers, new brain structure).*
