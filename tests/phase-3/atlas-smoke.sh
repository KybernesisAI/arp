#!/usr/bin/env bash
# Atlas smoke test — Phase 3 acceptance.
#
# End-to-end: build (or reuse) the sidecar image, mint a fake handoff committing
# to a known public key, pre-seed the matching private key into the data volume,
# `docker run` the container, verify /.well-known/did.json + /health, then
# SIGTERM and confirm a clean exit within 10 s. Finally reboots the container
# against the same volumes to prove idempotency.
#
# Exits 0 on success, non-zero on any failure.
set -euo pipefail

IMAGE="${IMAGE:-arp-sidecar:local}"
CONTAINER="arp-smoke-$$"
TMPDIR_ROOT="${TMPDIR:-/tmp}"
WORK=$(mktemp -d "${TMPDIR_ROOT}/arp-smoke-XXXXXX")
PORT="${PORT:-18443}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "==> workdir: $WORK"
echo "==> image:   $IMAGE"

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "error: image $IMAGE not found — build first with:" >&2
  echo "  docker build -t arp-sidecar:local -f apps/sidecar/Dockerfile ." >&2
  exit 2
fi

# Generate key + handoff via the helper (runs from apps/sidecar so @noble/ed25519
# resolves via the workspace's pnpm store).
pushd "$REPO_ROOT/apps/sidecar" >/dev/null
PUB_MB=$(node "$REPO_ROOT/tests/phase-3/gen-handoff.mjs" "$WORK")
popd >/dev/null
echo "==> agent pubkey: $PUB_MB"

echo "==> booting container on host port $PORT"
START_TS=$(date +%s)
docker run -d \
  --name "$CONTAINER" \
  -v "$WORK/handoff.json:/config/handoff.json:ro" \
  -v "$WORK/data:/data" \
  -p "${PORT}:443" \
  -e ARP_LOG_LEVEL=info \
  "$IMAGE" >/dev/null

# Poll /health up to 30 s
DEADLINE=$(( $(date +%s) + 30 ))
HEALTH_OK=""
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    HEALTH_OK=1
    break
  fi
  sleep 1
done
BOOT_TS=$(date +%s)
BOOT_ELAPSED=$((BOOT_TS - START_TS))

if [ -z "$HEALTH_OK" ]; then
  echo "fail: /health did not respond within 30 s" >&2
  docker logs "$CONTAINER" >&2
  exit 1
fi

echo "==> booted in ${BOOT_ELAPSED}s"
if [ "$BOOT_ELAPSED" -ge 10 ]; then
  echo "warn: boot took ${BOOT_ELAPSED}s (target: <10s)" >&2
fi

HEALTH_BODY=$(curl -fsS "http://127.0.0.1:${PORT}/health")
echo "==> /health: $HEALTH_BODY"
echo "$HEALTH_BODY" | grep -q '"ok":true' || { echo "fail: /health not ok" >&2; exit 1; }
echo "$HEALTH_BODY" | grep -q '"cert_fingerprint"' || { echo "fail: /health missing cert_fingerprint" >&2; exit 1; }

DID_BODY=$(curl -fsS "http://127.0.0.1:${PORT}/.well-known/did.json")
echo "==> /.well-known/did.json bytes: $(printf '%s' "$DID_BODY" | wc -c | tr -d ' ')"
echo "$DID_BODY" | grep -q '"id":"did:web:test.agent"' || {
  echo "fail: did.json does not advertise did:web:test.agent" >&2
  exit 1
}
echo "$DID_BODY" | grep -q "\"publicKeyMultibase\":\"$PUB_MB\"" || {
  echo "fail: did.json does not carry the expected publicKeyMultibase" >&2
  exit 1
}

curl -fsS "http://127.0.0.1:${PORT}/.well-known/agent-card.json" | grep -q '"did":"did:web:test.agent"' \
  || { echo "fail: agent-card.json malformed" >&2; exit 1; }

echo "==> firing 50 concurrent requests then SIGTERM"
for i in $(seq 1 50); do
  curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/.well-known/did.json" &
done

SIG_TS=$(date +%s)
docker stop -t 10 "$CONTAINER" >/dev/null
wait || true
EXIT_CODE=$(docker inspect -f '{{.State.ExitCode}}' "$CONTAINER")
EXIT_ELAPSED=$(( $(date +%s) - SIG_TS ))
echo "==> exited with code $EXIT_CODE in ${EXIT_ELAPSED}s"

if [ "$EXIT_CODE" != "0" ]; then
  echo "fail: container exited non-zero ($EXIT_CODE)" >&2
  docker logs "$CONTAINER" >&2
  exit 1
fi
if [ "$EXIT_ELAPSED" -gt 10 ]; then
  echo "fail: shutdown took ${EXIT_ELAPSED}s (budget: 10s)" >&2
  exit 1
fi

echo "==> second boot — verifying idempotency"
FP_BEFORE=$(cat "$WORK/data/certs/fingerprint.txt")
KEY_MTIME_BEFORE=$(stat -f %m "$WORK/data/keys/private.key" 2>/dev/null || stat -c %Y "$WORK/data/keys/private.key")
CERT_MTIME_BEFORE=$(stat -f %m "$WORK/data/certs/agent.pem" 2>/dev/null || stat -c %Y "$WORK/data/certs/agent.pem")

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d \
  --name "$CONTAINER" \
  -v "$WORK/handoff.json:/config/handoff.json:ro" \
  -v "$WORK/data:/data" \
  -p "${PORT}:443" \
  -e ARP_LOG_LEVEL=info \
  "$IMAGE" >/dev/null

DEADLINE=$(( $(date +%s) + 30 ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then break; fi
  sleep 1
done

FP_AFTER=$(cat "$WORK/data/certs/fingerprint.txt")
KEY_MTIME_AFTER=$(stat -f %m "$WORK/data/keys/private.key" 2>/dev/null || stat -c %Y "$WORK/data/keys/private.key")
CERT_MTIME_AFTER=$(stat -f %m "$WORK/data/certs/agent.pem" 2>/dev/null || stat -c %Y "$WORK/data/certs/agent.pem")

if [ "$FP_BEFORE" != "$FP_AFTER" ]; then
  echo "fail: cert fingerprint changed between boots ($FP_BEFORE → $FP_AFTER)" >&2
  exit 1
fi
if [ "$KEY_MTIME_BEFORE" != "$KEY_MTIME_AFTER" ]; then
  echo "fail: private key mtime changed across reboot" >&2
  exit 1
fi
if [ "$CERT_MTIME_BEFORE" != "$CERT_MTIME_AFTER" ]; then
  echo "fail: cert mtime changed across reboot" >&2
  exit 1
fi
echo "==> second boot idempotent ✓"

docker stop -t 10 "$CONTAINER" >/dev/null

echo
echo "atlas-smoke: OK"
