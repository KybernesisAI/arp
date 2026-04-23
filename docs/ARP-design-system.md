# ARP Design System — v0 (Phase 8.75)

**Status:** v0, shipped with Phase 8.75. Token source of truth is
`apps/cloud/tailwind.config.ts` + `apps/cloud/app/globals.css`. Components live
at `apps/cloud/components/ui/*`.

**Audience:** Phase 9 executors wiring the spec site (`spec.arp.run`), docs
site (`docs.arp.run`), and status page (`status.arp.run`) — they must theme
against this system so the public surface is coherent. Also authors of future
in-app surfaces in `apps/cloud`.

**Aesthetic:** Swiss / editorial. Paper background, ink foreground, hard
edges (no rounded corners), 12-column grid with visible 1 px hairlines,
monospace uppercase kickers + plate numbers, Space Grotesk display,
Instrument Sans body, JetBrains Mono for micro-copy and codes. Two signal
colors (blue + red) carry emphasis; yellow is the underline/highlight; green
is reserved for status indicators. Light default; dark theme is additive.

---

## 1. Design principles

1. **The grid is the content.** Every section sits on a 12-column grid with
   visible hairline rules. Blocks abut — no floating cards, no drop shadows.
2. **One dark ink, one paper, one accent at a time.** Within a single
   section, at most one of blue / red / yellow is in play. Never a rainbow.
3. **Mono for micro-copy, display for moments.** Plate numbers, kickers,
   label tags, button chrome, codes — all JetBrains Mono uppercase. Display
   lines use Space Grotesk 500. Body is Instrument Sans 400.
4. **No rounded corners.** Radii default to 0 except pills (status dots +
   tiny inline chips when required — none in v0).
5. **Tokens, not values.** Components reference theme tokens or CSS vars —
   never hex.

---

## 2. Color palette

Colors in CSS vars (see `app/globals.css`) so dark theme is a drop-in
override. Tailwind maps the same tokens onto utility classes.

### 2.1 Paper + ink (neutrals)

| Token | Light (default) | Dark | Role |
|---|---|---|---|
| `paper`   | `#f1ede4` | `#0b0b0b` | Page background |
| `paper-2` | `#e8e3d6` | `#151515` | Subtle inset / card-on-paper |
| `ink`     | `#0c0c0c` | `#f1ede4` | Primary text + rules |
| `ink-2`   | `#1a1a1a` | `#e8e3d6` | Secondary text, inverted block copy |
| `muted`   | `#6b6a62` | `#8a877d` | Tertiary text, mono meta |
| `rule`    | `#0c0c0c` | `#f1ede4` | 1 px hairline (== `ink`) |
| `grid`    | `rgba(12,12,12,0.07)` | `rgba(241,237,228,0.07)` | Faint grid overlay |

### 2.2 Signal (accent)

| Token | Hex | Role |
|---|---|---|
| `signal-blue`   | `#1536e6` | Primary CTA, one accent block per section, mark |
| `signal-red`    | `#e8371f` | Emphasis word in titles, one accent block, status-live dot |
| `signal-yellow` | `#f2c14b` | Typographic underline highlight, featured pill |
| `signal-green`  | `#0f7a4a` | Trust dots, operational status |

Palette variants (exposed but not used in v0 beyond the default): `mono`,
`warm`, `electric`. Documented for Phase 9 only if marketing pulls the
palette-swap lever.

### 2.3 Semantic aliases (used in component code)

```
bg-paper           → paper
bg-paper-2         → paper-2
bg-ink             → ink (inverted blocks)
text-ink           → ink
text-ink-2         → ink-2
text-muted         → muted
text-paper         → paper (foreground on ink-background blocks)
border-rule        → rule
ring-focus         → signal-blue
```

---

## 3. Typography

### 3.1 Families (Google Fonts, loaded once)

- **Display — Space Grotesk** (400 / 500 / 600 / 700). Used for hero, plate
  titles, card headings, price numbers.
- **Body — Instrument Sans** (400 / 500 / 600 / 700). Used for paragraph
  body copy, link inline labels, longer text.
- **Mono — JetBrains Mono** (300 / 400 / 500 / 600). Used for plate numbers,
  kickers (`// KEY_BENEFITS`), button labels, idx tags, code.

Fallback stack inside Tailwind `fontFamily` — everything degrades to system
fonts if webfonts fail to load.

### 3.2 Scale

Display + headings use Space Grotesk with a tight `-0.02em` letter-spacing.
Mono kickers sit at 10.5–11 px with `0.14em` letter-spacing, uppercase.

| Token | rem | px | Line-height | Use |
|---|---|---|---|---|
| `display-xl` | 7     | 112 | 0.95 | Final CTA big text |
| `display-lg` | 4     | 64  | 1.02 | Hero headline |
| `display-md` | 3     | 48  | 1.0  | Controls / dev lede / plate title (large) |
| `h1`         | 2.75  | 44  | 1.02 | Plate title (standard) |
| `h2`         | 2.5   | 40  | 1.0  | Problem lede |
| `h3`         | 1.625 | 26  | 1.05 | Feature card heading |
| `h4`         | 1.5   | 24  | 1.1  | How step, use case heading |
| `h5`         | 1.375 | 22  | 1.1  | Controls heading |
| `body-lg`    | 1.125 | 18  | 1.45 | Hero subhead, controls right |
| `body`       | 1     | 16  | 1.5  | Default body |
| `body-sm`    | 0.875 | 14  | 1.45 | Card body, legal strip |
| `kicker`     | 0.66  | 10.5| 1.2  | Mono kicker / idx / label (uppercase, `0.14em`) |
| `micro`      | 0.625 | 10  | 1.2  | Mono meter strip text |

---

## 4. Spacing + grid

- **Page:** max-width `1440px`, horizontal padding `32 px` (`px-8`).
- **Row:** 12 columns, `gap-4` (16 px). Nearly every layout primitive uses
  `grid-cols-12`.
- **Section:** `py-section` (`8rem` default, `6rem` compact). Sections are
  separated by a 1 px `border-rule` top rule.
- **Plate head:** 12-column row, `pb-6 border-b-rule mb-12`, with plate num
  in col 1, kicker in cols 2–5, title in cols 6–12.

Exposed Tailwind tokens: `max-w-page = 1440px`; section padding via
`py-section-tight` / `py-section-loose`.

---

## 5. Radii + borders

- **Radius:** `0` everywhere. A `radius-dot` (`9999px`) exists for status
  pulse dots and ticker trust marks, nothing else.
- **Borders:** 1 px solid `rule` (= ink). Hairline grids between cards are
  achieved by setting the grid container `background: rule` and the
  children `background: paper` with `gap: 0` — every column gap becomes a
  visible 1 px rule.
- **Focus ring:** 2 px `signal-blue` on keyboard focus, no offset, hard.
- **No drop shadows.** Component lift comes from color contrast and the
  hairline grid.

---

## 6. Motion

Animation is understated. The reference document uses one `420ms` out-curve
for reveals and a ticker.

| Token | Duration | Curve | Use |
|---|---|---|---|
| `motion-fast` | 160 ms | `cubic-bezier(0.2, 0.7, 0.2, 1)` | Button hover, link underline |
| `motion-std`  | 420 ms | `cubic-bezier(0.2, 0.7, 0.2, 1)` | Reveal on scroll, section fade-up |
| `motion-pulse`| 1600 ms| steps / ease | Live-dot pulse (CSS keyframe) |

`prefers-reduced-motion: reduce` is honored globally.

---

## 7. Component inventory (v0)

Every component under `apps/cloud/components/ui/` is surface-agnostic. No
component references a hostname — layouts assemble them.

| Component | Exports | Notes |
|---|---|---|
| `Button` / `ButtonLink` | `Button`, `ButtonLink`, `buttonVariants` | Hard-edged, mono uppercase label + arrow. Variants: `primary` (blue), `default` (paper→ink hover), `ghost`, `inverse` (for ink blocks). Sizes `sm` / `md`. |
| `Link` | `Link`, `linkVariants` | Underline-by-border variant uses a 1 px border-bottom (no text-decoration) for the editorial look. |
| `PlateHead` | `PlateHead` | Editorial section header. Props: `plateNum`, `kicker`, `title`, optional `titleEmphasis`. |
| `Section` | `Section` | Vertical rhythm + top rule + optional `tone` (`paper`, `paper-2`, `ink`). |
| `Container` | `Container` | Max-width `page` + `px-8`. |
| `Grid12` | `Grid12` | 12-column grid helper with gap 4. |
| `Card` | `Card` | Flat, hard-edged block. Used inside a grid to form a rule-separated matrix. |
| `FeatureCard` | `FeatureCard` | `idx`, `category`, `title`, `body`, `tone` (`paper` / `blue` / `yellow` / `red` / `ink`). Includes an `icon` slot rendered as an `IconShape`. |
| `PricingCard` | `PricingCard` | Tier, price, bullet list, CTA. `highlighted` ⇒ blue background + yellow popular flag. |
| `Hero` | `Hero`, `HeroTitle`, `HeroSub`, `HeroCTA`, `HeroMeta`, `EyebrowTag` | Editorial hero with pulse dot. |
| `Nav` | `Nav`, `BrandMark` | Sticky, ticker slot, mono uppercase links, CTA pill. |
| `Footer` | `Footer`, `FooterNewsletter` | Newsletter row, columns grid, legal strip. |
| `Badge` | `Badge` | Small mono-uppercase pill. `tone` = `muted` / `ink` / `blue` / `red` / `yellow`. |
| `Ticker` | `Ticker` | Horizontal marquee for the nav (SSR-safe). |
| `Input` | `Input`, `Textarea`, `Label`, `FieldHint`, `FieldError` | Form primitives — hard edges, `paper-2` inset. |
| `Code` / `Pre` | `Code`, `Pre` | Mono, `paper-2` inset. |
| `IconShape` | `IconShape` | Four abstract geometric "icons" (square-in-square, 3x3 dot grid, bars, chevron) used on feature cards as decorative marks. |
| `Dot` | `Dot` | Small status dot; `tone` = `red` (pulse) / `green` (solid) / `yellow`. |

Variant handling: `class-variance-authority` on `Button`, `Link`, `Badge`,
`FeatureCard`, `Section`. Class composition: `clsx` + `tailwind-merge`.

Hard rule: no hex / rgb values inside components. `grep -rn "#[0-9a-f]\{6\}"
apps/cloud/components/ui/` must return empty.

---

## 8. Surface application

The three hostnames each get their own layout that composes the primitives:

| Surface | Layout | Nav | Footer | Default tone |
|---|---|---|---|---|
| `arp.run` (project) | `app/project/layout.tsx` | `Nav` with mono links + "Try ARP Cloud" CTA; ticker disabled | Full editorial `Footer` | `paper` |
| `cloud.arp.run` (cloud marketing) | `app/cloud/layout.tsx` | `Nav` with ticker + "Get started" CTA | Full editorial `Footer` with newsletter | `paper`, sections alternate with `paper-2` or `ink` for emphasis |
| `app.arp.run` (authenticated) | root `app/layout.tsx` + `components/app/AppShell` wrapper | Slim top bar (brand + dashboard / billing / sign-out placeholder) | Single-line legal strip | `paper` |

Hero on project + cloud is the canonical editorial hero with meta row +
plate labels. Authenticated surface has no hero — it shows data.

---

## 9. Copy + voice guardrails

Phase 8.75 ships **placeholder copy**. Final copy lands at Phase 9.

- No DID, DIDComm, keypair, crypto, or Self.xyz in user-facing marketing.
  Protocol-layer terminology belongs on `spec.arp.run` / `docs.arp.run`
  (Phase 9).
- Outcome-oriented: "give your agent a home," "stay in control," "revoke
  instantly."
- Pricing numbers are placeholders (`{{TBD}}`) or match the reference
  document's values (`$0`, `$49`) only as design-stubs — real numbers land
  at Phase 9.
- No emoji.
- Placeholder markers: `[TBD]` for content, `{{value}}` for numeric values.

---

## 10. Handoff to Phase 9

Phase 9 spec / docs / status sites must match this system. Minimum:

1. Copy `tailwind.config.ts` + `globals.css` into each app, or (preferred
   if time) extract to a shared `@kybernesis/arp-ui` package — tracked in
   `CLAUDE.md §14`.
2. Fumadocs theme variables should map onto these tokens (Fumadocs
   supports CSS-variable theming — use that).
3. Code blocks in docs inherit the `Code` / `Pre` primitive styling —
   JetBrains Mono, `paper-2` background, hard-edged border.
4. Status page uses `signal-green` (operational) / `signal-yellow`
   (degraded) / `signal-red` (down). Dot component is re-usable.
5. Nav + Footer on `spec.arp.run` / `docs.arp.run` link cross-site back to
   `arp.run` and `cloud.arp.run`. Brand mark is identical.

---

## 11. Conservative calls (flagged)

1. **Design file was delivered as a local HTML mock, not a token export.**
   Tokens in this doc were extracted by reading the source HTML + CSS in
   `/Users/ianborders/Downloads/Swiss Design/ARP Landing.html` and mapping
   them onto Tailwind theme tokens. No alternate palettes (`mono`, `warm`,
   `electric`) are wired for Phase 8.75 beyond exposing the variables —
   Phase 9 can flip the palette via a single CSS-var swap.
2. **Google Fonts imported via `<link>` in `globals.css`**, not via
   `next/font`. Keeps the import surface minimal and matches the reference
   document. Phase 9 can migrate to `next/font/google` for self-hosted
   serving + size budgets if + when it matters.
3. **Hero diagram in the reference is an SVG with animated packet motion.**
   For v0 the hero ships a static but typographically faithful version —
   the animated mediator diagram is a single-component follow-up (`<HeroDiagram>`)
   marked `[TBD]` in the hero.
4. **Ticker is server-rendered static** — marquee animation is CSS-only,
   content is a fixed array. Live data (latency / event count) is a Phase 9
   wire-in.
5. **Dark theme is exposed via `[data-theme="dark"]` override** and CSS vars,
   but layout defaults to `light`. Phase 9 picks whether to enable the
   toggle.
6. **No shared UI package.** The design system lives under `apps/cloud/` to
   respect the phase brief's "do not touch `packages/*`" rule. Extraction
   to `@kybernesis/arp-ui` is tracked in `CLAUDE.md §14`.

---

*v0 — shipped with Phase 8.75 (brand + design scaffold). Update on any
schema change to `tailwind.config.ts` or `app/globals.css`.*
