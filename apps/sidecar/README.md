# @kybernesis/arp-sidecar

Packaged ARP runtime — a single Docker image that wraps `@kybernesis/arp-runtime`
with first-boot bootstrap, CLI, health checks, and graceful shutdown.

Most users never touch this package directly. They `docker run` the published
image; this README documents the knobs, volumes, and commands.

---

## Quickstart (Docker)

```bash
cd ~/my-agent               # your agent's working dir
# Put handoff.json here (downloaded from your registrar at checkout).

docker run -d --name my-arp \
  -v $(pwd)/handoff.json:/config/handoff.json:ro \
  -v my-arp-data:/data \
  -p 443:443 \
  ghcr.io/kybernesisai/sidecar:0.1
```

Then point a tunnel (ngrok, Cloudflare Tunnel, or a VPS reverse proxy) at port
443.

---

## Quickstart (docker-compose)

The repository ships `apps/sidecar/docker-compose.yml`. Copy it next to your
`handoff.json` and run:

```bash
docker compose up -d
```

---

## systemd (Linux bare-metal / VPS)

```bash
sudo arp-sidecar install-service --handoff /path/to/handoff.json
sudo journalctl -u arp-sidecar -f   # tail logs
```

`install-service` creates the `arp` user, provisions `/etc/arp-sidecar/` and
`/var/lib/arp-sidecar/`, copies the unit file, and starts it.

To remove:

```bash
sudo arp-sidecar uninstall-service
```

`/var/lib/arp-sidecar/` (keys + audit log + SQLite) is intentionally left in
place; delete it by hand if you truly mean to wipe the agent.

---

## CLI commands

| Command | Description |
|---|---|
| `arp-sidecar init [--handoff PATH] [--data-dir DIR]` | Run first-boot bootstrap and print the resolved DID, public key, and cert fingerprint as JSON. Does not start the server. |
| `arp-sidecar start [--handoff PATH] [--port 443] [--data-dir DIR] [--host 0.0.0.0]` | Bootstrap + listen. Default container entrypoint. |
| `arp-sidecar status [--host 127.0.0.1] [--port 443]` | Poll `/health`. Exits 0 if the sidecar responds within 3 s, 1 otherwise. |
| `arp-sidecar logs [--data-dir DIR]` | Tail the per-connection audit JSONL files under `<data-dir>/audit/`. For process logs use `docker logs <container>` or `journalctl -u arp-sidecar`. |
| `arp-sidecar audit verify [<connection_id>] [--data-dir DIR]` | Verify the hash-chain of one connection's audit log, or every log when the argument is omitted. |
| `arp-sidecar install-service [--handoff PATH]` | Install and start the systemd unit (Linux, root). |
| `arp-sidecar uninstall-service` | Disable, stop, and remove the systemd unit. |

Run any subcommand with `--help` for full flag details.

---

## Volumes

| Mount | Purpose | Notes |
|---|---|---|
| `/config/handoff.json` | Immutable handoff bundle from the registrar | Mount read-only |
| `/data/` | All persistent state | Named volume recommended |

Contents of `/data/` after first boot:

```
/data/
├── keys/
│   ├── private.key          # 32 raw Ed25519 bytes, 0600
│   └── public.key.multibase # z-base58btc, matches handoff commitment
├── certs/
│   ├── agent.pem            # self-signed X.509, 10-year validity
│   ├── agent.key            # PKCS#8 Ed25519, 0600
│   └── fingerprint.txt      # sha256 hex of DER; published in DID doc
├── well-known/
│   ├── did.json
│   ├── agent-card.json
│   └── arp.json
├── audit/                   # per-connection JSONL, tamper-evident chain
├── registry.sqlite          # WAL-mode SQLite of active connections
├── mailbox.sqlite           # transport mailbox
└── tls-fingerprint.txt      # legacy alias (runtime-bin compatibility)
```

---

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `ARP_LOG_LEVEL` | `info` | pino log level (`trace`\|`debug`\|`info`\|`warn`\|`error`\|`fatal`) |
| `ARP_PORT` | `443` | HTTP bind port |
| `ARP_HOST` | `0.0.0.0` | HTTP bind hostname |
| `ARP_DATA_DIR` | `/data` | Persistent state directory |
| `ARP_CEDAR_SCHEMA_PATH` | bundled | Override the Cedar schema |
| `ARP_SCOPE_CATALOG_VERSION` | `v1` | Scope catalog version pin |
| `ARP_REVOCATIONS_PROXY_URL` | unset | Proxy `/.well-known/revocations.json` to this URL |
| `AGENT_API_URL` | unset | Local URL your agent listens on (set by you; consumed by bundled dispatch hooks in Phase 6) |

---

## Graceful shutdown

- `SIGTERM` → 5 s grace. New requests to non-`/health` routes return `503
  {"error":"draining"}`; in-flight requests are allowed to complete.
- `SIGINT` → 1 s grace (interactive use).
- After the grace window the HTTP server closes, the transport is flushed, and
  SQLite is closed cleanly.
- `tini` is PID 1 inside the container, so Docker's default `STOPSIGNAL=SIGTERM`
  reaches Node correctly.

---

## Key custody

The private Ed25519 key is **generated on first boot inside the sidecar** and
written to `/data/keys/private.key` with `0600` permissions. The handoff
carries only a **public-key commitment** (`public_key_multibase`). On every
boot the sidecar derives the public key from the on-disk private and compares
against the commitment; mismatch aborts boot loudly. The handoff bundle is
rejected outright if it contains any `private_key` / `secret*` field.

For end-user flows where the user's browser pre-generates the keypair during
checkout, pre-seed `/data/keys/private.key` before the first `docker run`.

---

## Upgrading

```bash
docker pull ghcr.io/kybernesisai/sidecar:latest
docker restart my-arp
```

SQLite migrations run automatically on boot. The `/data` volume persists across
image upgrades.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `/health` never responds | Port 443 already bound on host, or the bootstrap threw. `docker logs <container>` will show the stack. |
| Boot fails with `public-key commitment mismatch` | The key on disk doesn't match the handoff. Wipe `/data/keys/` (only if you meant to start over) or supply the matching handoff. |
| Linux: `host.docker.internal` unreachable | Add `--add-host=host.docker.internal:host-gateway` to your `docker run`, or use the compose file which sets `extra_hosts`. |
| macOS Docker Desktop: sluggish SQLite | Known fsync quirk on bind-mounts. Prefer a named volume over a bind-mount for `/data`. |
| `install-service` asks for root | Run with `sudo`. Systemd unit installation touches `/etc` and `/var`. |

---

## Size budget

The runtime image must stay ≤300 MB. `scripts/validate-image-size.sh` enforces
this in CI after every `docker build`.

---

## License

MIT.
