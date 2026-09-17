# syntax=docker/dockerfile:1.7
#
# Multi-stage Dockerfile for @kybernesis/arp-cloud-gateway.
# Pattern mirrors apps/sidecar/Dockerfile — pnpm-install with the workspace
# lockfile, build the gateway + its workspace deps, then `pnpm deploy` to
# a flattened runtime image.
#
# Used by Railway (via railway.json's "build.dockerfilePath") and any other
# container host. The gateway listens on $PORT (Railway sets this; default
# 3001 for local). Postgres connection comes from $DATABASE_URL.

# ---------- build stage ----------
FROM node:24-bookworm-slim AS build
WORKDIR /build

# better-sqlite3 (transitive dep via @kybernesis/arp-runtime) ships prebuilt
# binaries for glibc/x64 — on the Debian base `prebuild-install` uses them
# and node-gyp never runs. (On Alpine/musl there are no prebuilds, so every
# build compiled from source and depended on downloading Node headers from
# unofficial-builds.nodejs.org, which timed out on Railway's builder on
# 2026-09-17.) Python + g++ stay installed as a fallback only.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

# Manifests + lockfile first so the install layer is cacheable.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY .changeset ./.changeset
COPY packages ./packages
COPY apps/cloud-gateway/package.json ./apps/cloud-gateway/

RUN pnpm install --frozen-lockfile --ignore-scripts

# Full sources + build every workspace dep the gateway needs.
COPY packages ./packages
COPY apps/cloud-gateway ./apps/cloud-gateway

RUN pnpm --filter '@kybernesis/arp-cloud-gateway...' run build

# Flatten the gateway + its prod deps into /out.
RUN pnpm --filter @kybernesis/arp-cloud-gateway deploy --prod --legacy /out


# ---------- runtime stage ----------
FROM node:24-bookworm-slim
WORKDIR /app

# tini for PID 1 signal forwarding.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -r arp && useradd -r -g arp -d /app -s /usr/sbin/nologin arp \
  && chown -R arp:arp /app

COPY --from=build --chown=arp:arp /out /app

# The Cedar PDP schema is loaded at boot. The default resolution path
# walks up from dist/ to packages/spec/src/cedar-schema.json — that
# layout doesn't exist inside the deployed runtime image, so we copy
# the file in explicitly + pin its location via env.
COPY --from=build --chown=arp:arp /build/packages/spec/src/cedar-schema.json /app/cedar-schema.json

USER arp

ENV NODE_ENV=production \
    PORT=3001 \
    CEDAR_SCHEMA_PATH=/app/cedar-schema.json

# Railway routes $PORT internally; expose for clarity.
EXPOSE 3001

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/bin.js"]
