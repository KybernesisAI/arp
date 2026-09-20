# AgentID S6c — Identity profile (name · description · picture · accent)

**Parent:** `docs/ARP-agentid-plan.md` §6. **Status:** building 2026-09-21 (ARP side first). **Approved by Ian 2026-09-21** ("YES TO THIS").

## 0. Why

Three unconnected copies of "who this agent is" exist today: the ARP identity row (name + description, no picture; only set at mint), the control plane's per-person `agent_profile` (display name, 128px avatar, accent, voice — synced across Studio, mobile, control plane), and the Buzz kind-0 profile (name, about, picture, signed on the host). The one thing that should be canonical — the `.agent` identity — has no picture and no edit surface. Badge portraits were a hardcoded PNG list in the repo.

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| P1 | **The `.agent` identity is the source of truth** for the public profile: name, description, picture, accent. Edited in one place: the name's page in the console. | One edit → everywhere. Owner-controlled, published with the name, portable when the name moves. |
| P2 | Picture is stored on the identity row (base64, ≤ 400 KB after the browser resizes to 512×512) and **served at the agent's own address**: `https://<sld>.agent.arp.run/avatar.png`. | No storage bucket, no separate CDN identity; the picture's URL is the name. The row stays small. |
| P3 | Public, cacheable JSON at `https://<sld>.agent.arp.run/.well-known/agent-profile.json` carries the whole profile (did, handle, name, description, picture, accent, nip05, verified links, updated_at). The identity document lists it as an `AgentProfile` service; the A2A card carries the picture as `iconUrl`. | Anything (Buzz, the control plane, a directory, a nostr client) reads one document. |
| P4 | **Buzz pulls, ARP never signs nostr.** `kybernesis-buzz profile --from-agentid` reads the profile JSON and publishes kind-0 `{name, display_name, about, picture, nip05: _@<sld>.agent, bot: true}` with the host-held Buzz key. | The Buzz key stays on the host; ARP holding it would be the wrong property. |
| P5 | **Control plane, Studio, mobile read the identity as the default** when an agent has a `.agent` link; a person's own `agent_profile` override still wins, field by field. | Keeps the existing per-person sync intact. Reverse direction (edit in Studio → ARP) is a later step through the verified control-plane link. |
| P6 | Re-provisioning and gifting carry the profile over (name, description, picture, accent). | A key rotation or a change of hands must not lose the face. |

## 2. ARP side (this repo)

| Task | Where | Done when |
|---|---|---|
| A1 schema | `packages/cloud-db/migrations/0016_agentid_profile.sql`: `agents.avatar_data TEXT`, `avatar_mime TEXT`, `accent TEXT`, `profile_updated_at TIMESTAMPTZ`. Drizzle schema + `updateAgent` pick list. | applied on PGlite (tests) + prod |
| A2 API | `GET/PUT /api/names/[sld]/profile` `{name, description, accent, avatar}` (`avatar` = data URL or `null` to clear; ≤ 400 KB; png/jpeg/webp). PUT updates the row, then `rebuildWellKnown` (DID doc `AgentProfile` service; A2A card `iconUrl`; re-signed). | route test: round-trip, size limit, clear, unauthenticated 401, not-owned 404 |
| A3 console | `ProfilePanel` on `/names/<sld>`: picture (upload → canvas resize 512² → PNG data URL, preview), name, description, accent colour, Save. Customer vocabulary only. | renders; manual check on kyber |
| A4 serving | Gateway: `GET /avatar.png` (mirror host → bytes, `Cache-Control: public, max-age=300`, 404 when none) and `GET /.well-known/agent-profile.json`. Middleware `MIRROR_GATEWAY_PATHS` += `/avatar.png`. | curl on kyber returns the PNG + JSON |
| A5 consumers | `loadBadgeData`: `avatarUrl` = identity picture when set, else the checked-in portrait, else the generated placeholder; `accent` exposed. Profile page hero/identity tile show the picture. `buildSignedA2aCard` + `mintIdentity` + gateway `lazyA2aCard` pass `iconUrl`. | badge + profile + card show the uploaded picture |
| A6 carry-over | `mintIdentity(force)` and `claimGift` preserve picture/accent. | reprovision + gift tests assert |

## 3. Platform side (`~/platform`)

| Task | Where | Done when |
|---|---|---|
| B1 | `@kybernesis/buzz` 0.9.12: `kybernesis-buzz profile --from-agentid [<name>.agent]` — name from the arg, else `ARP_IDENTITY_FILE` / `./.eve/arp-identity.json` (`did`); fetch `https://<sld>.agent.arp.run/.well-known/agent-profile.json`; publish kind-0 to every relay in `BUZZ_RELAY`. `Profile` gains `nip05`. | run on Kyber's host → kind-0 published; nostr client shows the picture + verified `_@kyber.agent` |
| B2 | Docs: identity README + create scaffold `arp.md` mention the command. | — |

## 4. Control plane (`~/kybernesis-admin`)

| Task | Where | Done when |
|---|---|---|
| C1 | `agent_ref.agentid_did TEXT` set when "Link .agent name" mints a statement (the intent to link). | migration |
| C2 | `GET /api/me/agents`: for agents with `agentid_did`, fetch the profile JSON (5-min in-process cache, 3 s timeout), confirm the JSON's verified links include `agent:<org>/<name>` (two-way), and return `identity: {did, name, description, picture, accent, profileUrl, verified}` plus `profile` defaults filled from it when the person set none. | Studio/mobile show Kyber's picture with no per-person profile row |

## 5. Not in this slice

Reverse sync (Studio → ARP); voice; per-relay picture upload (the mirror URL is used directly); profile history.
