# Demo video script — 60–90 seconds

**Status:** [DRAFT — FOR PUBLICATION REVIEW]

**Target length:** 75 seconds. Voiceover-driven. One continuous take;
screen recording at 1920×1080, 60fps.

**Objective:** show the "agent has a name + two agents talk + one gets
revoked" story in one breath. End on "now go do this yourself."

---

## Shot list

| Time | Screen | Voiceover |
|---|---|---|
| 00:00–00:05 | `arp.run` landing hero, then cut to terminal | Autonomous agents are already talking to each other. But they're doing it without a shared contract. |
| 00:05–00:12 | Terminal — `npx @kybernesis/arp-testkit audit samantha.agent` scrolls, lands on 11/11 green | ARP is that contract. One open protocol, eleven compliance probes, five framework adapters. |
| 00:12–00:25 | Browser — `cloud.arp.run/signup` fills in → onboarding generates a `did:key` → dashboard lights up with the new agent | A user signs up in ten seconds. Their principal identity is generated in the browser — the private key never leaves their device. |
| 00:25–00:40 | Two tabs open — a seller agent at `brand.agent` and a buyer agent at `buyer.agent`. Pairing QR scan. Consent token accepted. Message exchange plays in the audit log. | Two agents pair. A consent token captures the scope — `book-hotel` for the next 24 hours, budget capped at $500. Every message signs a link in the audit chain. |
| 00:40–00:55 | Owner revokes the connection from the dashboard. The next message on the buyer side bounces with a visible 403. | The owner revokes. Access stops immediately. The audit chain still verifies; nothing is rewritten. |
| 00:55–01:10 | Cut back to `arp.run`. Tagline card. "Open source. MIT licensed. v0.1 public review." | It's open source. MIT licensed. The v0.1 spec is live, the SDKs are at 1.0, and the first five framework adapters ship today. |
| 01:10–01:15 | End card with three URLs: arp.run — spec.arp.run — cloud.arp.run | Read the spec, ship an agent, or sign up for the free tier. We're at arp.run. |

---

## Voiceover pacing notes

- Aim for ~160 WPM — close to natural conversational pace. Hurried is
  worse than relaxed.
- Pause briefly after "ARP is that contract" — it's the thesis line.
- Emphasise "the private key never leaves their device" — this is the
  single most asked-about design choice.
- Do not mention Self.xyz, Clerk, Auth0, or any specific competing
  identity product. The framing is "open protocol vs proprietary
  product", not "us vs them."

## Screen recording setup

- macOS — QuickTime screen recording at 1920×1080. Retina panels must be
  scaled to 1x to avoid compression artefacts.
- Browser — Chrome with no extensions visible. Cloak the bookmarks bar.
- Terminal — iTerm2 at 16pt JetBrains Mono, 1.3× line height, paper
  theme (matches the design system).
- Cursor is the default macOS cursor — do NOT install a cursor
  highlighter, it looks amateur on export.

## Captions

Always bake captions at 100% opacity, top-aligned, Space Grotesk 22pt
white-on-ink. Caption every line of voiceover exactly — no paraphrasing.

## Post-production

- Export at `prores 422` for the source master; upload H.264 to the
  hosting platform.
- Add a 0.5s fade-in and 1s fade-out.
- Remove any ambient room tone longer than 0.3s between words.
- No music on v1 of the demo. Add music only after a second review pass.

## Final-check-before-post

- [ ] Captions match the voiceover word-for-word
- [ ] No competitor name appears anywhere on screen or in copy
- [ ] The terminal output shows 11/11 — not 8/8 (pre-9c) or 10/10
- [ ] The audit log visualization shows a green chain end-to-end
- [ ] End card URLs are exactly `arp.run`, `spec.arp.run`, `cloud.arp.run`
- [ ] Video length is ≤ 90s — cut ruthlessly if over
