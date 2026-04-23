# ARP Design System — v0 (Phase 8.75)

**Status:** v0 scaffold. Tokens and components are locked in `apps/cloud/tailwind.config.ts` + `apps/cloud/app/globals.css` + `apps/cloud/components/ui/*`.

**Audience:** Phase 9 executors wiring the spec site (`spec.arp.run`), docs site (`docs.arp.run`), and status page (`status.arp.run`) — they must theme against this system so the public surface area feels coherent. Also authors of future in-app surfaces in `apps/cloud`.

**Source:** dark-default palette aligned with the existing `apps/cloud` aesthetic (slate-900 / slate-50 / blue-500 range) and conventions shared across modern protocol-layer tools (Linear, Vercel, Railway, Plain). A richer design file was not accessible during this phase (see Conservative calls), so the tokens below are a deliberate minimal set — sized for the public landing surfaces and restyled authenticated dashboard, not for a full design-tool export.

---

## 1. Design principles

1. **Calm surface, loud truth.** The UI is quiet; the content and the agent-owner's decisions are the foreground. No decorative gradients, no stock photography, no emoji.
2. **Dark-first, accessible always.** The dark palette is the default because ARP is an infrastructure product that operators run alongside dev tooling. Every foreground/background pair meets WCAG AA.
3. **One accent, no rainbow.** A single blue accent (`accent-500`) carries CTA, links, and active states. Feedback colors (success / warn / danger) exist but are used sparingly.
4. **Grids over composition.** Every section aligns to a 12-column grid on the container width. No bespoke offsets.
5. **Tokens, not values.** Components never hardcode hex or rem. Everything goes through Tailwind theme tokens or CSS custom properties.

---

## 2. Color palette

All colors referenced in Tailwind as `bg-*` / `text-*` / `border-*` / `ring-*`. Semantic mapping is preferred; raw scale is available for exceptions.

### 2.1 Neutral scale (slate-derived)

| Token | Hex | Usage |
|---|---|---|
| `neutral-0`   | `#ffffff` | Pure white — on-accent foreground only |
| `neutral-50`  | `#f8fafc` | Rarely used; inverted surfaces only |
| `neutral-100` | `#e2e8f0` | Primary foreground text on dark bg |
| `neutral-200` | `#cbd5e1` | Body copy, secondary headings |
| `neutral-300` | `#94a3b8` | Tertiary text, captions |
| `neutral-400` | `#64748b` | Disabled text, subtle accents |
| `neutral-500` | `#475569` | Hairline borders |
| `neutral-600` | `#334155` | Default borders |
| `neutral-700` | `#1e293b` | Elevated surfaces (cards, modals) |
| `neutral-800` | `#111827` | Subtle surface tint |
| `neutral-900` | `#0f172a` | Page background (dark default) |
| `neutral-950` | `#020617` | Deepest surface (nav shadow base) |

### 2.2 Accent scale (blue)

| Token | Hex | Usage |
|---|---|---|
| `accent-300` | `#93c5fd` | Hover link text on dark bg |
| `accent-400` | `#60a5fa` | Secondary CTA outline / link default |
| `accent-500` | `#3b82f6` | Primary CTA background, focus ring |
| `accent-600` | `#2563eb` | Primary CTA hover |
| `accent-700` | `#1d4ed8` | Primary CTA active |

### 2.3 Feedback

| Token | Hex | Usage |
|---|---|---|
| `success-500` | `#10b981` | Confirmation banners, "operational" status |
| `warn-500`    | `#f59e0b` | Attention banners, "degraded" status |
| `danger-500`  | `#ef4444` | Destructive buttons, errors, "down" status |

### 2.4 Semantic aliases (preferred in component code)

Tailwind theme extends set these as pass-through values so components reference meaning, not the palette row.

```
bg-surface          → neutral-900
bg-surface-raised   → neutral-800
bg-surface-elevated → neutral-700
bg-inverse          → neutral-50
text-primary        → neutral-100
text-secondary      → neutral-200
text-muted          → neutral-300
text-subtle         → neutral-400
text-inverse        → neutral-900
border-default      → neutral-600
border-subtle       → neutral-700
border-strong       → neutral-500
ring-focus          → accent-500
```

---

## 3. Typography

### 3.1 Families

- **Sans (display + body):** `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Falls back to system UI everywhere so the page boots fast and renders identically if Inter is unavailable.
- **Mono:** `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`. Used for DIDs, codes, inline snippets, recovery phrases.

Font loading: `@next/font` or `next/font/google` binding is deferred to Phase 9 (the spec/docs sites pick fonts). For now the stack is pure system-font-first; `Inter` is listed as preferred but optional — the site renders fine without the webfont.

### 3.2 Scale

| Token | rem | px | Line-height | Use |
|---|---|---|---|---|
| `text-display-xl` | 4.5    | 72 | 1.05 | Rare — landing hero on wide screens only |
| `text-display-lg` | 3.75   | 60 | 1.1  | Hero headline |
| `text-display-md` | 3      | 48 | 1.15 | Section hero |
| `text-h1`         | 2.25   | 36 | 1.2  | Page title |
| `text-h2`         | 1.875  | 30 | 1.25 | Section heading |
| `text-h3`         | 1.5    | 24 | 1.3  | Subsection |
| `text-h4`         | 1.25   | 20 | 1.4  | Card heading |
| `text-body-lg`    | 1.125  | 18 | 1.6  | Hero subhead, landing body |
| `text-body`       | 1      | 16 | 1.6  | Default body |
| `text-body-sm`    | 0.875  | 14 | 1.55 | Secondary body, meta |
| `text-caption`    | 0.75   | 12 | 1.5  | Labels, footnotes |

Letter-spacing: `-0.02em` on display tokens, `-0.01em` on h1–h3, default on everything else.

Weights: `400` body, `500` UI elements, `600` headings + CTA labels, `700` display.

---

## 4. Spacing scale

Uses Tailwind's default `0 / 0.5 / 1 / 1.5 / 2 / 3 / 4 / 6 / 8 / 10 / 12 / 16 / 20 / 24 / 32` as `0 / 2 / 4 / 6 / 8 / 12 / 16 / 24 / 32 / 40 / 48 / 64 / 80 / 96 / 128` px. Semantic tokens layered on top:

| Token | Value | Use |
|---|---|---|
| `space-inline-xs` | `0.25rem` | icon-to-label |
| `space-inline-sm` | `0.5rem` | button internal gap |
| `space-inline-md` | `0.75rem` | default inline gap |
| `space-stack-xs`  | `0.5rem` | tight vertical |
| `space-stack-sm`  | `0.75rem` | form fields |
| `space-stack-md`  | `1.25rem` | default vertical gap |
| `space-stack-lg`  | `2rem` | section-internal separation |
| `space-section`   | `6rem` | top/bottom padding on landing sections (mobile: `4rem`) |

Container max-widths (Tailwind `container` + custom):
- `container-sm` — 640 px
- `container-md` — 768 px
- `container-lg` — 1024 px — **default marketing content width**
- `container-xl` — 1200 px — hero bands
- `container-wide` — 1440 px — nav bar only

---

## 5. Radii + shadows

### 5.1 Radii

| Token | Value | Use |
|---|---|---|
| `radius-none` | 0 | segmented controls |
| `radius-sm` | `0.25rem` | badges, inline chips |
| `radius-md` | `0.375rem` | default buttons, inputs |
| `radius-lg` | `0.5rem` | cards, panels |
| `radius-xl` | `0.75rem` | feature cards, pricing tiles |
| `radius-2xl` | `1rem` | hero panels |
| `radius-full` | `9999px` | pills, avatars |

### 5.2 Shadows

Subtle. The dark palette means shadows are mostly inner/outer ring effects, not big drop shadows.

| Token | Value | Use |
|---|---|---|
| `shadow-none`   | `none` | default |
| `shadow-sm`     | `0 1px 2px 0 rgb(0 0 0 / 0.25)` | hover lift on cards |
| `shadow-md`     | `0 4px 12px -2px rgb(0 0 0 / 0.35)` | modals, dropdowns |
| `shadow-lg`     | `0 16px 32px -8px rgb(0 0 0 / 0.45)` | floating panels |
| `shadow-ring`   | `0 0 0 1px rgb(148 163 184 / 0.18)` | hairline surround for elevated surfaces |
| `shadow-focus`  | `0 0 0 2px rgb(59 130 246 / 0.6)` | focus ring |

---

## 6. Motion

Keep movement short and purposeful. Default transition: `150ms cubic-bezier(0.16, 1, 0.3, 1)` (ease-out snap).

| Token | Duration | Curve | Use |
|---|---|---|---|
| `motion-snap` | 100 ms | linear | button press |
| `motion-ease-out` | 150 ms | `cubic-bezier(0.16, 1, 0.3, 1)` | hover, focus |
| `motion-ease-in-out` | 200 ms | `cubic-bezier(0.4, 0, 0.2, 1)` | dropdowns, collapses |
| `motion-smooth` | 300 ms | `cubic-bezier(0.22, 1, 0.36, 1)` | page transitions |

Honor `prefers-reduced-motion: reduce` globally — `globals.css` sets `transition: none !important; animation: none !important;` inside the media query.

---

## 7. Component inventory (v0)

All under `apps/cloud/components/ui/`. Every component is surface-agnostic — no knowledge of whether it's rendering on the project, cloud, or app surface.

| Component | Exports | Notes |
|---|---|---|
| `Button` | `Button`, `buttonVariants` | Variants: `primary`, `secondary`, `ghost`, `link`, `danger`. Sizes: `sm`, `md`, `lg`. Built on `cva`. |
| `Link` | `Link` | Wraps Next.js `Link`; variants: `default`, `muted`, `external`. External links get `rel="noopener"`. |
| `Container` | `Container` | Max-width aware (`sm`/`md`/`lg`/`xl`/`wide`). Horizontal padding built in. |
| `Section` | `Section` | Vertical rhythm helper; applies `space-section` top/bottom padding + optional `tone` (`surface` / `surface-raised`). |
| `Card` | `Card`, `CardHeader`, `CardBody`, `CardFooter` | Raised surface with radius-xl + ring. |
| `FeatureCard` | `FeatureCard` | Composition over `Card` for benefits grid items. Icon slot + heading + body. Icon slot is optional (no default emoji/svg set). |
| `PricingCard` | `PricingCard` | Tier name + price + bullet list + CTA. Supports `highlighted` boolean. |
| `Hero` | `Hero`, `HeroEyebrow`, `HeroHeadline`, `HeroSubhead`, `HeroCTA` | Compositional primitives; surfaces assemble their own heroes. |
| `Nav` | `Nav`, `NavItem`, `NavCta` | Sticky header with theme-aware background. Surface passes items + CTA. |
| `Footer` | `Footer`, `FooterColumn`, `FooterLink` | Multi-column footer. Surface passes columns. |
| `Badge` | `Badge` | Pill with variants `neutral`, `success`, `warn`, `danger`, `accent`. |
| `Input` | `Input`, `Label`, `FieldHint`, `FieldError` | Basic form primitives used by onboarding. |
| `Divider` | `Divider` | 1-px rule, `subtle` / `default` tones. |
| `Code` | `Code` | Inline monospace chip for DIDs, identifiers. |

Variant handling: `class-variance-authority` for `Button` / `Badge` / `Link`. Class composition: `clsx` + `tailwind-merge` (exported from `components/ui/lib/cn.ts`).

**Hard rule:** No hex/rgb values inside components. Every color reference goes through a Tailwind utility or a CSS custom property exposed in `globals.css`. `grep -rn "#[0-9a-f]\{6\}" apps/cloud/components/ui/` must return empty.

---

## 8. Surface application

The three hostnames each get their own layout that composes the primitives:

| Surface | Layout | Nav palette | Footer palette | Default tone |
|---|---|---|---|---|
| `arp.run` (project) | `app/project/layout.tsx` | `bg-surface`, `text-primary` links | Multi-column (Protocol / Resources / Community) | `bg-surface` |
| `cloud.arp.run` (cloud marketing) | `app/cloud/layout.tsx` | `bg-surface`, accent CTA | Multi-column (Product / Company / Resources / Legal placeholders) | `bg-surface`; alternating sections use `bg-surface-raised` |
| `app.arp.run` (authenticated) | existing `app/layout.tsx` + per-route layouts | Minimal top bar (wordmark + user menu placeholder) | Slim legal strip | `bg-surface` |

Nav sticky behavior: all three use `sticky top-0` with `backdrop-blur` + translucent `bg-surface/80`.

---

## 9. Copy + voice guardrails

Phase 8.75 ships **placeholder copy only**. The design system assumes:

- No DID, DIDComm, keypair, crypto, or Self.xyz references in user-facing marketing copy (project + cloud surfaces). Those terms belong in dev-facing docs (Phase 9 spec + docs sites).
- Outcome-oriented wording: "your key never leaves your device," "nothing happens without your approval," "see every action your agent takes."
- Pricing tiers include `[TBD]` markers on all numbers — a human sets real pricing at launch.
- No emoji anywhere in markup or copy.
- Marks for placeholders: `[TBD]` for content and `{{value}}` for numeric values so they are greppable before launch.

---

## 10. Handoff to Phase 9

The Phase 9 spec site + docs site + status page must match this system. Minimum requirements:

1. Re-use the same Tailwind token set. Copy `tailwind.config.ts` + `globals.css` into each app, or (preferred if time) extract to a private `@kybernesis/arp-ui` package — noted as post-launch follow-up in §14 of `CLAUDE.md`.
2. Nav + Footer components on `spec.arp.run` and `docs.arp.run` should link cross-site back to `arp.run` and `cloud.arp.run`.
3. Fumadocs theme variables should map onto these tokens (Fumadocs supports CSS-variable theming — use that to avoid forking its components).
4. The status page (`status.arp.run`) uses the `success-500` / `warn-500` / `danger-500` feedback palette for status dots.
5. Code blocks in docs inherit the `Code` primitive's monospace stack + `bg-surface-raised` background.

---

## 11. Conservative calls (flagged)

1. **Anthropic design file not accessible.** The URL provided in the phase brief (`https://api.anthropic.com/v1/design/h/Asa3liW5Hx3AYL7q_F2kUA?open_file=ARP+Landing.html`) returned HTTP 404 in multiple fetch attempts during Phase 8.75. Tokens in this doc were derived instead from (a) the existing `apps/cloud` slate-900/blue-500 aesthetic, (b) conventions from comparable protocol-layer products, and (c) WCAG AA contrast requirements. If the real design file is recoverable later, retrofit the token values without changing the semantic structure — every component goes through named tokens, so a retheme is localised to `tailwind.config.ts` + `globals.css`.
2. **Dark-only for v0.** No light-theme implementation in Phase 8.75. CSS variables are wired so a `[data-theme="light"]` override can be dropped in later without touching components. Flagged for Phase 9 if marketing demands a light hero.
3. **Motion tokens declared, not heavily used.** The scaffold uses `motion-ease-out` for button/hover only. Richer scroll-bound animation is deferred — Phase 9 can opt in per-page without new tokens.
4. **No font webfont wiring.** `Inter` + `JetBrains Mono` are listed as preferred but system fallbacks carry the full design without a network request. Phase 9 wires `next/font` if + when a real font import is desired.
5. **No shared UI package.** The design system lives under `apps/cloud/` to stay within the phase brief's hard constraint ("Do not touch `packages/*`"). Extraction to `@kybernesis/arp-ui` is tracked as post-launch cleanup in `CLAUDE.md §14`.

---

*v0 — shipped with Phase 8.75 (brand + design scaffold). Update on any schema change to `tailwind.config.ts` or `app/globals.css`.*
