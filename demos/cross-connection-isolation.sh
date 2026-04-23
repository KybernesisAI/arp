#!/usr/bin/env bash
# demos/cross-connection-isolation.sh
#
# Shows Samantha's memory isolation story via the phase-5 stress test.
# Sends the secret "Project Alpha launch date is July 1" under connection
# A and asks for it back under connection B for 10 memory categories ×
# 100 runs. Zero leaks = pass.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== ARP demo: cross-connection isolation ==="
echo
echo "Spinning up two runtimes (Samantha + Ghost) with two separate connections."
echo "Secrets set under connection A must never be recalled under connection B."
echo
pnpm --filter @kybernesis/arp-phase-5-acceptance exec vitest run cross-connection-isolation.test.ts \
  --reporter=default 2>&1 | tail -15
