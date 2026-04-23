#!/usr/bin/env bash
# Fail if the arp-sidecar image exceeds the Phase 3 size budget (300 MB).
# Designed to run after `docker build -t arp-sidecar:local -f apps/sidecar/Dockerfile .`
# in CI; it never pulls the image from a registry.
set -euo pipefail

IMAGE="${IMAGE:-arp-sidecar:local}"
MAX_BYTES=$((300 * 1024 * 1024))

if ! command -v docker >/dev/null 2>&1; then
  echo "validate-image-size: docker not found in PATH" >&2
  exit 2
fi

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "validate-image-size: image $IMAGE not present; build it first" >&2
  exit 2
fi

SIZE=$(docker image inspect "$IMAGE" --format='{{.Size}}')

if ! [[ "$SIZE" =~ ^[0-9]+$ ]]; then
  echo "validate-image-size: docker inspect returned non-numeric size: $SIZE" >&2
  exit 2
fi

HUMAN=$(awk -v s="$SIZE" 'BEGIN{printf "%.1f MB", s/1024/1024}')

if [ "$SIZE" -le "$MAX_BYTES" ]; then
  echo "ok: $IMAGE is $HUMAN (limit 300 MB)"
  exit 0
fi

echo "fail: $IMAGE is $HUMAN, exceeds 300 MB budget" >&2
exit 1
