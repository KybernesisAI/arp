# ARP Phase 8 — Mobile Apps

**Reader:** Claude Code. Directives only.

**Companion docs:** `ARP-phase-0-roadmap.md`, `ARP-phase-4-pairing-owner-app.md`, `ARP-phase-7-cloud.md`, `ARP-hns-resolution.md`.

---

## 0. Reader orientation

**Phase goal:** iOS + Android native apps that bypass the HNS browser-DNS problem (built-in resolver), add biometric consent for high-risk scopes, handle QR pairing, and deliver push notifications for pending approvals.

**Tech pins:**
- React Native via Expo (managed workflow initially; eject if native modules demand it)
- Native modules: `expo-secure-store` (keychain), `expo-local-authentication` (biometrics), `expo-camera` (QR), `expo-notifications` (push)
- HNS resolution: bundle a DoH client that queries `hnsdoh.com/dns-query`
- DIDComm: `@arp/sdk` runs client-side in the app (no server-side requirement for mobile)
- Push: Expo Push Notifications service → APNs/FCM
- Backend: reuses Phase 7's cloud backend (`arp.cloud`) for tenant auth and connection API
- State: Zustand for local state; Tanstack Query for server data
- Design system: Tailwind via NativeWind + shadcn-ui-native adaptation

**Out of scope:** Android-only / iOS-only features (parity required), Apple Watch / WearOS (v0.2+), offline-first (v0 requires internet), E2E messaging between users (this is an owner-management app, not a chat app).

---

## 1. Definition of done

- [ ] iOS build signed and testable via TestFlight
- [ ] Android build signed and testable via Play Console internal track
- [ ] App Store / Play Store listings drafted (icon, screenshots, copy)
- [ ] Principal DID login flow (sign-challenge) with Face ID / Touch ID / Android biometrics
- [ ] QR pairing: scan invitation → consent screen → biometric approve → countersign
- [ ] Push notifications fire on incoming pairing requests + step-up-required actions
- [ ] Biometric re-auth required for `critical`-risk scopes
- [ ] Full connection management parity with Phase 4 web owner app
- [ ] HNS resolution works inside the app regardless of system DNS
- [ ] Passes full testkit when used to manage a reference agent

---

## 2. Prerequisites

- Phases 1–7 complete
- Apple Developer + Google Play accounts
- Firebase project for FCM (Android pushes)
- APNs cert/key configured

---

## 3. Repository

Separate repo: `arp-mobile` (not in the main `arp/` monorepo due to Expo's tooling).

```
arp-mobile/
├── app/                           # Expo Router routes
│   ├── _layout.tsx
│   ├── (auth)/
│   │   ├── welcome.tsx
│   │   └── login.tsx
│   ├── (app)/
│   │   ├── index.tsx              # agents list
│   │   ├── agent/[did]/
│   │   │   ├── index.tsx          # connections list
│   │   │   ├── connection/[id]/
│   │   │   │   ├── index.tsx      # detail
│   │   │   │   ├── audit.tsx
│   │   │   │   └── revoke.tsx
│   │   │   ├── pair.tsx
│   │   │   └── scan.tsx
│   │   └── settings.tsx
│   └── +not-found.tsx
├── components/
├── lib/
│   ├── arp/                       # client wrapper around @arp/sdk
│   ├── hns/                       # DoH resolver
│   ├── biometric/
│   └── push/
├── assets/
│   ├── icon.png
│   ├── splash.png
│   └── ...
├── app.json                       # Expo config
├── eas.json                       # EAS Build config
└── package.json
```

---

## 4. Implementation tasks

### Task 1 — Expo scaffold

1. `npx create-expo-app arp-mobile --template tabs`
2. Configure `app.json` with bundle id `com.arp.owner`, iOS + Android targets
3. Set up EAS Build: `eas build:configure`
4. Install deps: NativeWind, Zustand, Tanstack Query, Expo modules listed in Tech pins

**Acceptance:** `npx expo start --ios` launches the simulator; `npx expo start --android` launches the emulator.

### Task 2 — HNS resolver module

`lib/hns/resolver.ts`:
1. Implement DoH client using `fetch` against `hnsdoh.com/dns-query`
2. Wire into app's HTTP client: every `.agent` URL is resolved via DoH, then fetch is issued with the original Host header
3. TLS validation uses DID-pinned fingerprints from `@arp/sdk`

**Acceptance:** unit test — `resolveAgent("samantha.agent")` returns expected IP.

### Task 3 — Principal DID login

1. Welcome screen with "Sign in with your principal key"
2. Generate Ed25519 keypair on first install, store in keychain (`expo-secure-store`)
3. Sign a server-issued challenge with the principal key; POST to `arp.cloud/auth`
4. On success, store session token encrypted in keychain
5. Biometric required to unlock the key on each app launch

**Acceptance:** login flow works end-to-end against staging cloud; key never leaves the secure enclave.

### Task 4 — Agents list (`(app)/index.tsx`)

1. Fetches `GET arp.cloud/agents?tenant=<me>`
2. List view of agents: name, DID (truncated), online status, connection count
3. Tap → `(app)/agent/[did]`

**Acceptance:** renders real data from the cloud backend; pull-to-refresh works.

### Task 5 — Agent detail

1. Connections list: grouped by peer, sorted by recent activity
2. Per-connection row: label, scope summary (short), pending consent indicator
3. Actions: Audit, Revoke, Adjust scopes

**Acceptance:** matches Phase 4 feature set.

### Task 6 — QR scanner + pair flow

1. `(app)/agent/[did]/scan.tsx`: camera view via `expo-camera`
2. On valid QR decode → parse invitation → navigate to `(app)/agent/[did]/pair`
3. Pair screen renders consent view via `@arp/consent-ui`
4. "Prove with Self.xyz" button opens the Self.xyz mobile SDK (or universal link)
5. On approval, biometric prompt → sign the Connection Token → post to cloud
6. Success animation + return to connections list

**Acceptance:** end-to-end QR pairing works on real device against reference agent.

### Task 7 — Push notifications

1. Register for push on first launch (APNs + FCM via Expo)
2. Store the push token on the cloud backend tied to the tenant
3. Backend sends push on:
   - Pending pairing request
   - Step-up-required action (re-consent needed)
   - High-value payment authorization pending
   - Connection about to expire
4. Tapping notification deep-links into the relevant screen

**Acceptance:** push arrives within 10s of trigger on both iOS + Android.

### Task 8 — Biometric gates

1. `lib/biometric/gate.ts`: `requireBiometric(risk: 'low'|'medium'|'high'|'critical')`
2. Low/medium: no gate
3. High: biometric required
4. Critical: biometric + 15-minute re-prompt window
5. Fallback to passcode if biometric unavailable

**Acceptance:** revoking a critical-risk scope prompts biometric; cancelling blocks the revoke.

### Task 9 — Audit viewer

1. Paginated list, same content as Phase 4 web
2. Filter + search
3. Tap entry → detail sheet with the full payload (copyable)

**Acceptance:** renders 100+ entries with smooth scroll; filters work.

### Task 10 — Settings

- Principal key fingerprint (display, copy)
- Sign-out (clears keychain, unregisters push)
- App version
- Link to privacy policy + ToS

### Task 11 — App icons + store assets

1. Produce icon set (1024x1024 master + generated sizes)
2. Splash screen
3. Screenshots for App Store + Play Store (5 per platform minimum)
4. App description + keywords (draft, will be refined at Phase 9 launch)

**Acceptance:** EAS Build produces signed binaries ready for TestFlight / Internal track.

### Task 12 — TestFlight + Play internal release

1. Submit via EAS Submit
2. Invite 10 internal testers per platform
3. Collect a feedback round before Phase 9

**Acceptance:** internal testers can install and complete a full pairing flow.

---

## 5. Acceptance tests

```bash
cd arp-mobile
pnpm install
pnpm typecheck
pnpm lint
pnpm test                    # Jest for RN
pnpm e2e:ios                 # Maestro or Detox
pnpm e2e:android
eas build --platform all --profile preview
```

---

## 6. Deliverables

- iOS + Android builds on their respective stores (internal tracks)
- Deep-linking set up with custom URI scheme `arp://` + universal links for `arp.cloud` + HNS gateway
- Push notification pipeline live
- Parity with Phase 4 web owner app

---

## 7. Handoff to Phase 9

- Mobile apps graduate from internal tracks to public store listings
- Marketing site links to app stores
- Onboarding docs reference mobile as the recommended owner UI

---

## 8. v0 decisions (do not reopen)

- Expo managed workflow; eject only if blocked by a specific native need
- React Native, not Flutter or native (SwiftUI/Compose)
- No Android widget / iOS complication in v0
- Single-account per install (no profile switching; rare edge case)
- Portrait-only; landscape post-launch
- Minimum iOS 16, Android 10

---

## 9. Common pitfalls

- **Expo + Self.xyz native SDK:** if Self.xyz requires native modules not in Expo's default set, you'll need EAS Development Builds. Plan for that.
- **QR scanner permissions:** iOS + Android both require camera permission prompts before first use. Handle the "denied" state gracefully.
- **Background WebSocket is hard on mobile.** We don't keep a WS open in the app — push handles the "wake me up" part, and the app pulls state on foreground.
- **Keychain sync iCloud can leak keys across devices unintentionally.** Use `kSecAttrSynchronizable: false`.
- **Play Store reviewers are strict about crypto.** Be ready to explain Ed25519 usage in the data-safety form.
