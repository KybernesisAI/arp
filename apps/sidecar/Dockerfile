# syntax=docker/dockerfile:1.7

# ---------- build stage ----------
FROM node:24-alpine AS build
WORKDIR /build

# better-sqlite3 compiles native bindings — install toolchain on Alpine.
RUN apk add --no-cache python3 make g++ \
  && corepack enable

# Manifests + lockfile first — lets Docker cache the install layer.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY .changeset ./.changeset
COPY packages ./packages
COPY apps/sidecar/package.json ./apps/sidecar/
COPY apps/runtime-bin/package.json ./apps/runtime-bin/

RUN pnpm install --frozen-lockfile

# Sources + build every workspace so the sidecar's deps are present as dist/.
COPY packages ./packages
COPY apps/sidecar ./apps/sidecar
COPY apps/runtime-bin ./apps/runtime-bin

RUN pnpm --filter '@kybernesis/arp-sidecar...' run build

# `pnpm deploy` flattens the sidecar + its workspace deps into /out with
# hoisted node_modules — exactly what we want in the runtime image.
RUN pnpm --filter @kybernesis/arp-sidecar deploy --prod --legacy /out


# ---------- runtime stage ----------
FROM node:24-alpine
WORKDIR /app

# tini for PID 1 signal forwarding; curl for the image HEALTHCHECK.
RUN apk add --no-cache tini curl \
  && addgroup -S arp && adduser -S -G arp arp \
  && mkdir -p /config /data \
  && chown -R arp:arp /app /config /data

COPY --from=build --chown=arp:arp /out /app

USER arp

VOLUME ["/config", "/data"]
EXPOSE 80 443

ENV NODE_ENV=production \
    ARP_DATA_DIR=/data \
    ARP_PORT=443 \
    ARP_HOST=0.0.0.0

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:${ARP_PORT:-443}/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "/app/dist/cli.js", "start", "--handoff", "/config/handoff.json", "--data-dir", "/data", "--port", "443", "--host", "0.0.0.0"]
