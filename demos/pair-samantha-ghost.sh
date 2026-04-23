#!/usr/bin/env bash
# demos/pair-samantha-ghost.sh
#
# Scripted pairing flow end to end, against a local dual-runtime
# instantiated in-process by the phase-5 acceptance tests. Produces
# a deterministic transcript — the phase-5 pairing flow prints one
# stable `connection_id` per run (random; the transcript's shape is
# deterministic, not its IDs).
#
# Usage:
#   demos/pair-samantha-ghost.sh
#
# Does not require any network access. Runs in <30 s.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== ARP demo: pair Samantha ↔ Ghost ==="
echo
echo "1. Bringing up in-process runtimes + driving the full pairing flow via the phase-5 helper..."
pnpm --filter @kybernesis/arp-phase-5-acceptance exec vitest run testkit-integration.test.ts \
  --reporter=default \
  --silent=false 2>&1 | tail -20

echo
echo "2. Same flow from the CLI (local runtime at http://127.0.0.1:5501):"
echo "   pnpm --filter @kybernesis/arp-testkit exec arp-testkit audit localhost --base http://127.0.0.1:5501"
