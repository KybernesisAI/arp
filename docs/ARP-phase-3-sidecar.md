# ARP Phase 3 — Sidecar Packaging

**Reader:** Claude Code. Directives only.

**Companion docs:** `ARP-phase-0-roadmap.md`, `ARP-phase-2-runtime-core.md`, `ARP-installation-and-hosting.md`, `ARP-example-atlas-kyberbot.md`, `ARP-example-atlas-vps.md`.

---

## 0. Reader orientation

**Phase goal:** wrap Phase 2's runtime into a single Docker image + systemd unit that users install with one command. First-boot wizard reads a `handoff.json`, provisions keys, publishes the DID doc, and starts the agent. Image published to GitHub Container Registry.

**Tech pins:**
- Base image: `node:24-alpine`
- Multi-stage Dockerfile (build stage + runtime stage)
- Config via env vars + mounted volume for `handoff.json`
- Persistent state via named Docker volume
- systemd unit for Linux bare-metal installs
- CLI wrapper tool: `arp-sidecar`

**Out of scope:** Kubernetes (Helm chart is v0.2+), Windows service (not targeted), ARP Cloud backend (Phase 7), owner app bundling (Phase 4 mounts it; this phase exposes the route).

---

## 1. Definition of done

- [ ] `ghcr.io/kybernesisai/sidecar:0.1` image builds and runs
- [ ] `docker run` with the Atlas example command from `ARP-example-atlas-kyberbot.md §3` boots a working agent in <10s
- [ ] First-boot path provisions keys, generates TLS cert, publishes DID doc, persists state
- [ ] Second-boot path loads state, continues where it left off, does not regenerate keys
- [ ] Graceful shutdown on SIGTERM (5s grace) and on SIGINT
- [ ] systemd unit file installs cleanly via `arp-sidecar install-service` on Ubuntu 24.04
- [ ] CLI commands: `init`, `start`, `status`, `logs`, `audit verify`, `install-service`, `uninstall-service`
- [ ] Image size ≤300 MB
- [ ] Health check passes within 10s of start
- [ ] Phase 2 integration tests still pass when run against the containerized binary

---

## 2. Prerequisites

- Phase 2 complete (`@kybernesis/arp-runtime` and `runtime-bin` working)

---

## 3. Repository additions

```
arp/
├── apps/
│   ├── runtime-bin/                # unchanged from Phase 2
│   └── sidecar/                    # new — the shipped binary + CLI wrapper
│       ├── src/
│       │   ├── cli.ts              # commander-based CLI
│       │   ├── bootstrap.ts        # first-boot logic
│       │   ├── health.ts
│       │   ├── service-install.ts  # systemd unit installer
│       │   └── index.ts
│       ├── Dockerfile
│       ├── docker-compose.yml      # example for documentation
│       ├── systemd/
│       │   └── arp-sidecar.service
│       ├── package.json
│       └── README.md
├── .github/
│   └── workflows/
│       └── image-publish.yml       # builds + pushes ghcr image on tag
└── scripts/
    └── validate-image-size.sh
```

---

## 4. Implementation tasks

### Task 1 — CLI wrapper

1. Create `apps/sidecar/src/cli.ts` with commands:

```
arp-sidecar init              # interactive: reads handoff.json, verifies, stores config
arp-sidecar start [--handoff PATH] [--port 443] [--data-dir /data]
arp-sidecar status            # calls /health on localhost
arp-sidecar logs              # tails the audit log + process log
arp-sidecar audit verify      # runs audit chain verifier from @kybernesis/arp-audit
arp-sidecar install-service   # Linux only: installs systemd unit
arp-sidecar uninstall-service
```

2. Use `commander` for parsing
3. Each command returns 0 on success, non-zero on failure
4. `status` exits 0 if health returns ok within 3s, else 1

**Acceptance:** `arp-sidecar --help` lists all commands; each subcommand `--help` prints specific usage.

### Task 2 — First-boot bootstrap logic

`apps/sidecar/src/bootstrap.ts`:

1. Given a handoff bundle path, validate it against `@kybernesis/arp-spec` HandoffBundleSchema
2. Check data directory:
   - If `keys/private.key` exists: load it (second+ boot)
   - Else: derive keypair from handoff's public key + retrieve private key from owner (see §8 decisions)
3. Generate self-signed TLS cert via `@kybernesis/arp-tls` if `certs/agent.pem` absent; cache fingerprint
4. Write the DID document JSON to `/app/well-known/did.json` with the correct key + fingerprint
5. Write `agent-card.json` and `arp.json` similarly
6. Initialize SQLite at `<data-dir>/registry.db` (runs migrations)
7. Initialize audit log dir at `<data-dir>/audit/`
8. Start `@kybernesis/arp-runtime` pointing at this config
9. Emit a one-line startup banner listing: agent DID, port, cert fingerprint, handoff version

Boot is idempotent: running twice changes nothing.

**Acceptance:** boot test — fresh data dir + handoff → running agent serves `/.well-known/did.json`; kill; restart; same DID doc served; same fingerprint.

### Task 3 — Dockerfile

```dockerfile
# syntax=docker/dockerfile:1.7

# ---------- build stage ----------
FROM node:24-alpine AS build
WORKDIR /build
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ ./packages/
COPY apps/sidecar/package.json ./apps/sidecar/
COPY apps/runtime-bin/package.json ./apps/runtime-bin/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm -r build
RUN pnpm --filter @kybernesis/arp-sidecar deploy --prod /out

# ---------- runtime stage ----------
FROM node:24-alpine
WORKDIR /app
RUN apk add --no-cache tini curl
COPY --from=build /out /app
VOLUME ["/config", "/data"]
EXPOSE 80 443
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "/app/dist/cli.js", "start", "--handoff", "/config/handoff.json", "--data-dir", "/data"]
```

**Acceptance:** `docker build -t arp-sidecar:local .` succeeds; `docker images` shows ≤300 MB.

### Task 4 — docker-compose.yml example

`apps/sidecar/docker-compose.yml` — a working template users copy:

```yaml
version: '3.8'
services:
  arp-sidecar:
    image: ghcr.io/kybernesisai/sidecar:0.1
    container_name: atlas-arp
    restart: always
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./handoff.json:/config/handoff.json:ro
      - arp-data:/data
    environment:
      - AGENT_API_URL=http://host.docker.internal:3874
      - ARP_LOG_LEVEL=info
volumes:
  arp-data:
```

**Acceptance:** `docker compose up -d` in a test dir with a mock handoff runs the agent; `docker compose down -v` cleans up.

### Task 5 — systemd unit

`apps/sidecar/systemd/arp-sidecar.service`:

```ini
[Unit]
Description=ARP Sidecar
After=network.target

[Service]
Type=notify
User=arp
Group=arp
WorkingDirectory=/var/lib/arp-sidecar
ExecStart=/usr/local/bin/arp-sidecar start --handoff /etc/arp-sidecar/handoff.json --data-dir /var/lib/arp-sidecar
Restart=always
RestartSec=5
TimeoutStopSec=10
KillMode=mixed
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
```

`service-install.ts` implements:
1. Copy the `arp-sidecar` binary to `/usr/local/bin`
2. Create user/group `arp` if missing
3. Create dirs `/etc/arp-sidecar`, `/var/lib/arp-sidecar` with correct perms
4. Expect handoff at `/etc/arp-sidecar/handoff.json` (prompt user to place it)
5. Copy the unit file to `/etc/systemd/system/`
6. `systemctl daemon-reload && systemctl enable --now arp-sidecar`
7. Print `journalctl -u arp-sidecar -f` instructions

`uninstall-service` reverses all of the above.

**Acceptance:** on an Ubuntu 24.04 test VM, run `arp-sidecar install-service` with a prepared handoff, verify `systemctl status arp-sidecar` shows running, then `arp-sidecar uninstall-service` cleans up completely.

### Task 6 — Health check + graceful shutdown

1. `/health` endpoint in `@kybernesis/arp-runtime` already returns `{ ok: true, version, uptime_ms }`; extend to also return `{ cert_fingerprint, connections_count, audit_seq }`
2. On SIGTERM:
   a. Stop accepting new HTTP requests (return 503)
   b. Wait up to 5s for in-flight requests to complete
   c. Flush audit log
   d. Close SQLite cleanly
   e. Exit 0
3. On SIGINT: same sequence, shorter grace (1s)

**Acceptance:** start agent, fire 50 concurrent requests, send SIGTERM mid-flight; all 50 complete; process exits 0 within 6s.

### Task 7 — Logging

1. Use `pino` for structured JSON logs to stdout
2. Log levels via `ARP_LOG_LEVEL` env (default `info`)
3. Every request logs: `msg_id`, `connection_id`, `action`, `decision`, `obligations`, `duration_ms`
4. Sensitive fields redacted: all JWTs, cert bodies, private keys

**Acceptance:** log output is valid JSONL; redaction test confirms no `"private_key":` appears anywhere.

### Task 8 — Image-publish workflow

`.github/workflows/image-publish.yml`:
1. Trigger: pushed tag `sidecar-v*`
2. Steps:
   a. Checkout
   b. Set up Docker Buildx
   c. Login to GHCR with `GITHUB_TOKEN`
   d. `docker buildx build --push --platform linux/amd64,linux/arm64 --tag ghcr.io/kybernesisai/sidecar:${VERSION} --tag ghcr.io/kybernesisai/sidecar:latest .`
3. Also emit the image as a GitHub Release artifact (link only)

**Acceptance:** workflow file validates via `actionlint`; manual dry run with `--load` instead of `--push` produces the image locally.

### Task 9 — Image-size guard

`scripts/validate-image-size.sh`:
```bash
SIZE=$(docker image inspect arp-sidecar:local --format='{{.Size}}')
MAX=$((300 * 1024 * 1024))
[ "$SIZE" -le "$MAX" ] || { echo "Image too large: $SIZE"; exit 1; }
```

Add to CI after the image build step.

**Acceptance:** script exits 0 for compliant images.

### Task 10 — README for `apps/sidecar/`

Document:
- Quickstart (one docker run)
- docker-compose example
- systemd install
- All CLI commands with examples
- Troubleshooting (health check fails → likely cert or port binding issue)
- How to upgrade (`docker pull` + restart; state migrates automatically via SQLite migrations)

### Task 11 — Atlas example smoke test

Add `tests/phase-3/atlas-smoke.sh` that mirrors the steps from `ARP-example-atlas-kyberbot.md §3`:

1. Create a fake `handoff.json` for `test.agent`
2. `docker run` with the canonical flags
3. Wait up to 30s for health to pass
4. Query `/.well-known/did.json` — assert it returns a valid document
5. Query `/health` — assert `{ ok: true }`
6. Send SIGTERM — assert container exits 0 within 10s

**Acceptance:** script passes end-to-end.

---

## 5. Acceptance tests

From repo root:
```bash
pnpm install
pnpm -r typecheck
pnpm -r build
pnpm -r test
docker build -t arp-sidecar:local -f apps/sidecar/Dockerfile .
bash scripts/validate-image-size.sh
bash tests/phase-3/atlas-smoke.sh
```

All exit 0.

---

## 6. Deliverables

- `apps/sidecar/` with Dockerfile, systemd unit, CLI
- `ghcr.io/kybernesisai/sidecar:0.1` published (via workflow; first real push at Phase 9)
- Multi-arch image (amd64 + arm64)
- Documentation README
- Atlas smoke test

---

## 7. Handoff to Phase 4

Phase 4 (Pairing + Owner App) consumes:
- Sidecar image as the hosting substrate for the owner web app (mounted as a sub-route `/owner/*`)
- First-boot bootstrap as the place where owner-subdomain routing is configured
- Graceful shutdown semantics (owner app shares them)

Phase 4 adds new HTTP routes and a bundled Next.js build; it does not refactor the sidecar's core lifecycle.

---

## 8. v0 decisions (do not reopen)

- `node:24-alpine` base only (no Debian/Ubuntu variants)
- Single-process container (no supervisord, no multi-service)
- `tini` as PID 1 for signal handling
- GHCR only; no Docker Hub publishing in v0
- Linux + macOS (Docker Desktop) supported; Windows untested
- `/config` and `/data` volumes; no other volumes
- Ports 80 + 443 fixed; non-443 mode reachable only via `--port` flag, and only for development

**On key custody (resolved):** the private key is **generated on first boot inside the sidecar** and written to `<data-dir>/keys/private.key` with 0600 permissions. The handoff bundle contains a **bootstrap token** and a **public-key commitment**; on first boot, the sidecar generates the keypair, verifies the public key matches the commitment placed there by the user during checkout (the user's browser generated the keypair in Step 1 of registration). If the commitment doesn't match, first boot fails. This keeps the private key out of the handoff bundle while still proving it's the right agent.

---

## 9. Common pitfalls

- **`host.docker.internal` doesn't work on Linux without `--add-host=host.docker.internal:host-gateway`.** Document this in the README for Linux users.
- **SQLite in a mounted volume on macOS Docker Desktop has quirky fsync.** Benchmark and document; consider `PRAGMA journal_mode=WAL`.
- **ARM builds can be slow.** Use buildx cache layers aggressively.
- **Publishing to GHCR requires the `packages: write` permission** on the workflow token.
- **`tini -- node` passes signals correctly only if you use `ENTRYPOINT ["/sbin/tini", "--"]` with `CMD [...]`** — do not wrap in a shell.
