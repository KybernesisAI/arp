# ARP Mobile — Repository Pointer

The ARP mobile app (iOS + Android, built with Expo) lives in a **separate repo**:

| Thing | Value |
|---|---|
| GitHub | `github.com/KybernesisAI/arp-mobile` |
| Local | `/Users/ianborders/arp-mobile` |
| Package | `arp-mobile` (private, not published to npm) |
| Bundle id | `com.arp.owner` |
| Framework | React Native via Expo (managed workflow) |
| Distribution (Phase 8) | EAS Build `preview` profile — internal only |
| Distribution (Phase 10) | App Store + Play Store public listings |

## Why a separate repo

Expo's tooling (`create-expo-app`, `eas`, config plugins, Metro bundler) assumes it owns the repo root. Mixing it with a Turborepo/pnpm-workspaces monorepo fights both toolchains and bloats the main repo's lockfile with iOS/Android-only deps. We keep the mobile app in its own repo, pinned to the same `@kybernesis/arp-*` packages once published.

During Phase 8 the `@kybernesis/arp-*` packages are still dormant on npm (tag `next`). The mobile app ships a small **portable subset** of their logic inline (HNS DoH, scope-catalog risk map, canonicalize-for-sig) under `arp-mobile/lib/arp/`. The plan is to switch those to real `@kybernesis/arp-*` dependencies at Phase 9 publish.

## Scope (Phase 8)

Phase 8 is **scaffold only — no public launch**.

- ✅ Expo app scaffold with routes from `docs/ARP-phase-8-mobile.md §3`
- ✅ Principal DID sign-challenge login against Phase-7 cloud
- ✅ HNS DoH resolver (in-app, `hnsdoh.com/dns-query`)
- ✅ Biometric gates for high/critical scopes
- ✅ Push notification wiring (Expo push service)
- ✅ Store listing drafts (icons, descriptions, App Privacy / Data Safety — **not submitted**)
- ✅ EAS `preview` builds signed and installable on test devices
- ❌ No App Store / Play Store submissions
- ❌ No public TestFlight group

Public launch (App Store + Play Store) is **Phase 10**, post Phase 9 launch of the protocol itself.

## Setup

```bash
git clone https://github.com/KybernesisAI/arp-mobile.git ~/arp-mobile
cd ~/arp-mobile
pnpm install
pnpm typecheck
pnpm test
npx expo start --ios       # opens iOS Simulator
npx expo start --android   # opens Android Emulator
```

EAS (Apple Developer account required on ARP team):

```bash
pnpm dlx eas-cli login
eas build:configure                                # already committed
eas build --platform ios --profile preview --non-interactive
eas build --platform android --profile preview --non-interactive
```

## Integration points

- **Cloud API:** the mobile app is a client of `apps/cloud/` in this monorepo. Routes consumed:
  - `POST /api/auth/challenge` + `POST /api/auth/verify` — principal DID login
  - `GET  /api/agents` + `GET /api/agents/:did` — agents + connections
  - `GET  /api/agents/:did/audit?connection_id=…` — audit log
  - `POST /api/connections/:id/revoke` — revoke
  - `POST /api/push/register` (added by Phase 8 cloud-side TODO, flagged in the mobile PR)
- **DIDComm / crypto:** via `@kybernesis/arp-sdk` once published. Today: inline Ed25519 via `@noble/ed25519` + `expo-secure-store` for key storage.
- **Consent rendering:** the mobile pair screen mirrors `@kybernesis/arp-consent-ui` (React Native adaptation). Scope risk tiers come from the scope-catalog manifest copied inline.

## Cross-phase invariants still apply

Every invariant from `CLAUDE.md §4` that's relevant to a mobile client applies to the `arp-mobile` repo:

- No DIDComm libs outside the SDK's transport layer. In mobile, this means no direct `@veramo/*` or `didjwt` imports — route through `@kybernesis/arp-sdk`'s public interface (once published) or the inline portable subset.
- No `npm publish`; the mobile app isn't an npm package.
- No push to origin without explicit user approval.
- No `.env*` committed; no `GoogleService-Info.plist` / `google-services.json` committed.
- All commits: conventional, scoped, with `[phase-8/task-N]` tags.

## Phase 10 handoff

When the protocol goes public (Phase 9), the mobile app graduates to public App Store + Play Store listings in Phase 10:

- Promote EAS `preview` → `production` profile
- Submit via `eas submit --platform ios/android`
- Apply store-listing drafts under `arp-mobile/store-listings/{ios,android}/`
- File App Privacy (iOS) + Data Safety (Android) forms using the JSON/YAML drafts
- Switch cloud API base URL from staging to production

Until then the `preview` builds are installable only via TestFlight internal tester group (iOS) or Play Console internal track (Android — once a Play Console account exists).
