# ARP Operations

Operations documentation for ARP Cloud + related public surfaces. This
directory is the single source of truth for runbooks, on-call state, and
response procedures.

| Doc | Purpose |
|---|---|
| [`incident-runbook.md`](./incident-runbook.md) | Severity definitions, escalation ladder, communication templates, runbook entries for known failure modes |
| [`on-call-rotation.md`](./on-call-rotation.md) | Rotation schedule, handoff checklist, contact information |

## Scope

Public surfaces under operational scope:

- `arp.run` — project landing
- `cloud.arp.run` — cloud marketing + signup
- `app.arp.run` — authenticated dashboard
- `cloud.arp.run/api/*` — registrar + push + webauthn endpoints
- `spec.arp.run` — specification site
- `docs.arp.run` — developer documentation
- `status.arp.run` — status page

Out of operational scope for slice 9e:

- Self-hosted sidecar installs (user-owned infra; we provide documentation + support, not uptime)
- Reference agents (`samantha.agent`, `ghost.agent` — Phase 5B when deployed)

## Post-9e launch checklist

See `docs/launch/checklist.md` for the full flip-to-production checklist. Key
operational prerequisites tracked there:

- PagerDuty / Opsgenie integration (deferred)
- Live uptime monitoring (deferred)
- Real on-call rotation assignments (`[TODO: Ian]` throughout this directory)
- Tabletop exercise before Milestone B flip
