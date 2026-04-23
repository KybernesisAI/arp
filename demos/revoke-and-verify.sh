#!/usr/bin/env bash
# demos/revoke-and-verify.sh
#
# Revokes an active connection and proves the peer is rejected.
# Runs the phase-5 revocation-race harness with a single run so the
# transcript reads like a narrative rather than a stress test.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== ARP demo: revoke & verify ==="
echo
echo "Flow: Ghost sends 3 requests (allowed) → Samantha revokes → Ghost sends 3 more (denied)"
echo "      → audit chain verifies → revocation visible at /.well-known/revocations.json"
echo
PHASE5_REVOCATION_RUNS=1 pnpm --filter @kybernesis/arp-phase-5-acceptance exec vitest run revocation-races.test.ts \
  --reporter=default 2>&1 | tail -15
