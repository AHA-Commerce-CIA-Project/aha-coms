# Rev 3 — Spec 02: Design System Extraction

> Priority: **2 (after Spec 01 lands; foundation for suite-wide UX consistency)**
> Scope: Portal (canonical docs + token + UI package skeletons) + Heroes (DESIGN.md redirect, future package adoption) + future H-apps (one onboarding path)
> Prerequisites: Spec 01 (account widget) — service bar's right-side ownership is settled before chrome components ship.

---

## Status — 2026-04-30

**Phase 1 (lift docs + cut standalone repos): done** — see §Migration / Rollout.

**Phase 2 (token package): shipped portal-side.** `@coms-portal/design-tokens` v1.0.0 published at https://github.com/mrdoorba/coms-design-tokens. `tokens.yaml` extracted from DESIGN.md frontmatter as canonical source; build pipeline emits `tokens.css`, `tailwind-preset.js` (v3 stub), `tokens.ts`. Portal `apps/web` consumes `@coms-portal/design-tokens/css` via `@import` (Tailwind v4 `@theme` block); old inline tokens removed.

**Phase 3 (chrome package): shipped portal-side.** `@coms-portal/ui` v1.0.0 published at https://github.com/mrdoorba/coms-ui. `src/chrome/{ServiceBar,Sidebar,MobileTopBar,MobileBottomNav}.svelte` lifted from Heroes' canonical layout, refactored to be host-agnostic (props for `navItems` / `services` / `user` / `theme` / `currentPath` + `right` snippet for widget mount). `Header.svelte` deliberately excluded — app-level concern (search/notifications/i18n), not chrome. Portal `apps/web` consumes the package; old local layout files deleted.

**Phase 4 (primitives): shipped end-to-end across portal + Heroes 2026-04-29 → 2026-04-30.** `@coms-portal/ui` v1.2.0 published at https://github.com/mrdoorba/coms-ui (commit `744f887`, tag `v1.2.0` at SHA `8afee43...`). 15 shadcn-svelte v3 primitive families lifted verbatim from Heroes' original `packages/web/src/lib/components/ui/` (avatar, badge, button, card, dialog, dropdown-menu, input, label, select, separator, sheet, skeleton, table, tabs, textarea), with `cn()` helper + four type helpers co-lifted as `src/utils.ts`. New direct dependencies: `bits-ui`, `clsx`, `tailwind-merge`, `tailwind-variants`, `lucide-svelte` (batteries-included — consumer adds `@coms-portal/ui` and deps come along).

- **Portal `apps/web` adoption (2026-04-29):** all 13 admin pages + 3 lib components + 2 auth pages refactored to v1.2.0 primitives — `commit ce53bf5` (initial wave) + `8b2d476` (employees list follow-up). Second consumer materialized; Phase 4 trigger fired by portal itself.
- **Heroes adoption (2026-04-30):** the workshop returns its tools. 24 Heroes files rewritten from `$lib/components/ui/<family>` to flat `@coms-portal/ui/primitives` barrel imports; namespace usage (`<Dialog.Root>`, `<Card.Header>`, `<Table.Body>`) flattened to aliased forms; `PullToRefresh.svelte` moved to `lib/components/` (not part of v1.2.0 lift); `cn()` + four type helpers stripped from Heroes' `utils.ts`; `packages/web/src/lib/components/ui/` directory deleted entirely (103 files, 2,276 lines net). `commit b7b7431` on `mrdoorba/coms-aha-heroes`. The fork risk between Heroes' local `ui/` and the platform package is permanently closed — future primitive changes happen upstream once and propagate by tag bump.

Compositions remain stub: Heroes' `HeroGreeting`/`SummaryCard`/`NotificationsBadge` are dashboard-specific (Heroes brand gradients, gold/silver/bronze brand scales) and were deliberately not lifted as platform compositions; the `compositions/` export entry is preserved for a future shared candidate.

**Phase 5: still deferred.** Trigger (real third H-app onboarding) has not fired. Heroes adoption is no longer a pending follow-up — it shipped 2026-04-30 (see Phase 4 status above).

> **Contributing UI changes?** This spec is the architectural intent. The contribution workflow — where to PR, how to test locally before opening a PR, versioning rules, reviewer expectations — lives in [`/DESIGN_SYSTEM.md`](../../../DESIGN_SYSTEM.md) at the repo root. Hand that doc to teams adopting the design system.

---

## Overview

Heroes' repo currently hosts `my-design-guideline/DESIGN.md`, a comprehensive COMS Design System spec covering tokens, typography, chrome, and components. The content is solid but the **location is wrong** for a multi-app system: the design language lives inside one consumer rather than at the federation hub.

Two structural problems follow from that location:

1. **Source-of-truth drift.** Each new H-app will be told "match Heroes' DESIGN.md." By the time the third app onboards, Heroes' copy will have evolved past what's actually shipped, and the other apps will be matching a snapshot frozen at their onboarding date.
2. **Spec without code.** Every section describes how a Button or Card should look, but none of it ships as a consumable component. Each new app re-implements from the spec and silently diverges within weeks (different gradient angle, missing shine sweep, off-by-one easing curve).

Spec 02 turns the design system into a **package-distributed system with the portal repo as canonical source**:

- `DESIGN.md` (the doc) lifts from Heroes into the `coms-ui` repo as the canonical reference. Heroes' copy becomes a redirect.
- `@coms-portal/design-tokens` and `@coms-portal/ui` are introduced as new shared packages, distributed as standalone GitHub repos matching `@coms-portal/shared` (consumed via `git+https://github.com/.../...git#vX.Y.Z`).
- `ONBOARDING.md` and `CHANGELOG.md` ship alongside `DESIGN.md` inside the `coms-ui` repo.

After Spec 02, a new H-app's design integration is `bun add` + four imports, not "read the spec and reimplement."

---

## Decisions Up Front

### Source of truth: portal repo, not Heroes repo

The portal team owns federation; the design system is part of federation (it's what makes the suite *look* like one product). Lifting `DESIGN.md` out of Heroes into the portal-owned `coms-ui` repo aligns ownership with responsibility. Heroes' copy is reduced to a one-paragraph redirect — no content lost, just relocated.

### Doc structure: three files, not one

- `DESIGN.md` — reference. Read repeatedly. Tokens, components, voice, do's/don'ts.
- `ONBOARDING.md` — integration playbook. Read once per new app. Step-by-step install + mount.
- `CHANGELOG.md` — version history of the token + UI packages, with breaking-change migration notes.

Splitting these means daily reference reads stay tight, onboarding stays linear, and version churn doesn't bloat the reference doc.

### What ships as a package vs. what stays per-app

| Layer | Lives in `@coms-portal/*` | Lives in each H-app |
|---|---|---|
| Tokens (colors, spacing, type scale, radii, shadows, motion) | Yes — single source | Imported, never overridden |
| Primitives (Button, Card, Input, StatusBadge, Avatar, Tabs, Dialog) | Yes — pure presentation | Imported, fed app-specific data |
| Chrome shells (ServiceBar, Sidebar, MobileTopBar, MobileBottomNav) | Yes — visual shell + slots | Imported, fed app-specific nav items |
| Generic compositions (HeroGreeting, SummaryCard, NotificationPanel) | Yes — content-agnostic | Imported, fed app-specific data |
| Page layouts | No | Each app composes its own pages |
| Routes / business logic | No | Each app owns entirely |
| Domain models (Points, Stock, Cohorts, Courses) | No | Each app's bounded context |
| Domain components (Heroes Leaderboard, etc.) | No | Stay in their app |

The line: **anything that knows about points/leaderboards/stock stays in the app**; anything that's a visual primitive or shared chrome lifts up.

### Distribution: standalone git repos (matching `@coms-portal/shared`)

`@coms-portal/shared` is currently consumed by both portal and Heroes via `git+https://github.com/mrdoorba/coms-shared.git#v1.1.0`. New shared packages follow the same model:

- `@coms-portal/design-tokens` → `github.com/mrdoorba/coms-design-tokens` (skeleton at `v0.1.0`)
- `@coms-portal/ui` → `github.com/mrdoorba/coms-ui` (skeleton at `v0.1.0`, also hosts `DESIGN.md` / `ONBOARDING.md` / `CHANGELOG.md`)
- `@coms-portal/account-widget` (from Spec 01) → its own repo

Skeletons live in their own repos from day one — no in-portal staging. Local development against unreleased changes uses `bun link` or a temporary `git+...#commit-sha` pin.

### Token authoring: yaml frontmatter is source, generated outputs ship

The existing `DESIGN.md` has yaml frontmatter listing every color/spacing/radius/typography token. That yaml becomes the **single source** for a build step that emits:

1. `dist/css/tokens.css` — `:root { ... }` + `.dark { ... }` blocks of CSS custom properties.
2. `dist/tailwind/preset.js` — Tailwind preset consuming the same values.
3. `dist/ts/tokens.ts` — TypeScript const exports for runtime use (e.g. inline-style edge cases, charts).

The yaml-vs-prose drift in Heroes' current `DESIGN.md` (yaml says `#F2F3F8`; prose says `oklch(0.970 0.010 258)`) is fixed by making the yaml authoritative and regenerating prose tables at build time, or by removing the duplicated values from prose. Decision pushed to implementation: generate prose tables from yaml is cleanest.

### Component framework: Svelte 5 only

Both portal and Heroes are Svelte 5. No web-component wrapping. If a non-Svelte H-app ever appears, re-evaluate then.

### Versioning: semver, breaking changes via major bump

- `0.x.y` during initial scaffold + first portal/Heroes adoption (breaking changes allowed in minors).
- `1.0.0` cuts when both portal and Heroes consume the package and have run in production for 7+ days.
- After 1.0.0, breaking changes require a major bump and a CHANGELOG.md migration note.

---

## Layout

### `github.com/mrdoorba/coms-ui` — `@coms-portal/ui`

```
DESIGN.md         — canonical reference (lifted from Heroes)
ONBOARDING.md     — new H-app integration playbook
CHANGELOG.md      — token + UI package version history
README.md
package.json
tsconfig.json
src/
  index.ts          — re-exports
  primitives/       — Button, Card, Input, Badge, Avatar, Tabs, Dialog
  chrome/           — ServiceBar, Sidebar, MobileTopBar, MobileBottomNav
  compositions/     — HeroGreeting, SummaryCard, NotificationPanel
```

Bundling the docs into `coms-ui` keeps the spec, the components, and the changelog moving together — one PR updates all three.

### `github.com/mrdoorba/coms-design-tokens` — `@coms-portal/design-tokens`

```
README.md
package.json
tsconfig.json
src/
  tokens.yaml         — single source (lifted from DESIGN.md frontmatter, Phase 2)
  index.ts            — TS exports
  tokens.css          — generated CSS custom properties (dev: hand-written; later: built from yaml)
  tailwind-preset.js  — Tailwind preset
build/                — generated outputs (gitignored once yaml→build pipeline lands)
```

### `coms_aha_heroes/my-design-guideline/DESIGN.md` (after migration)

Reduced to a redirect note pointing at the canonical doc in the portal repo. Content body removed.

---

## Migration / Rollout

### Phase 1 — Lift docs + cut standalone repos ✅ DONE

- `DESIGN.md`, `ONBOARDING.md`, and `CHANGELOG.md` lifted into `github.com/mrdoorba/coms-ui` as canonical reference.
- Heroes' `my-design-guideline/DESIGN.md` reduced to a redirect note.
- Empty package skeletons cut as standalone repos: `github.com/mrdoorba/coms-design-tokens` (`v0.1.0`) and `github.com/mrdoorba/coms-ui` (`v0.1.0`). No in-portal staging directory.

After Phase 1: a single canonical reference exists, addressable by tag. No app consumes any new package yet; portal and Heroes continue to use their existing inline components and Tailwind configs unchanged.

### Phases 2–5 — Deferred

Implementation of the token + UI packages is **deferred**. There is no fixed timeline; phases ship when there's a concrete trigger.

**Triggers that should pull Phase 2 forward:**
- A third H-app is about to onboard. Onboarding without the token package means yet another app re-implementing from the spec — exactly the drift Spec 02 is meant to prevent.
- DESIGN.md token values change (palette tweak, spacing rescale). Without the package, every consumer must hand-update; with it, one bump propagates.
- Portal and Heroes diverge visibly on a token (e.g. one updates `--primary` and the other doesn't). Drift detected = time to lift.

**Triggers for Phase 3 (chrome migration):**
- Account widget (Spec 01) ships and needs a documented mount point in the service bar / mobile top bar. Phase 3 codifies the slot contract.
- Heroes or portal needs a chrome change (e.g. add a tenant switcher to the service bar). Doing it once in `@coms-portal/ui` beats doing it twice.

**Triggers for Phase 4 (primitives + compositions): TRIGGERED 2026-04-29; HEROES ADOPTED 2026-04-30.** Portal `apps/web` itself materialized as the second consumer when it adopted v1.2.0 primitives across all 13 admin pages. Heroes followed the next day with full adoption — local `ui/` directory deleted, all 24 imports rewired to `@coms-portal/ui/primitives`. Compositions deliberately remained stub — see §Status.

**Triggers for Phase 5 (onboarding exercise):**
- A real third H-app starts onboarding. Phases 2–4 should be in place by then.

### Phase plan when triggers fire

When Phase 2 is pulled forward, it covers:
- Extract `tokens.yaml` from DESIGN.md frontmatter into `coms-design-tokens`.
- Build script generates `tokens.css`, `tailwind-preset.js`, `tokens.ts`.
- Tag a `v1.0.0` cut once both portal and Heroes are ready to consume.
- Portal `apps/web` migrates from its current Tailwind config to consume the preset.
- Heroes consumes the same package. Both apps now share token source.

Phase 3 covers:
- `ServiceBar`, `Sidebar`, `MobileTopBar`, `MobileBottomNav` migrate from Heroes into `@coms-portal/ui`.
- Heroes consumes the package version. Portal adopts the same chrome (replacing its existing `apps/web/src/lib/components/layout/*`).
- Account widget (Spec 01) integrates via the chrome's right-slot prop.

Phase 4 shipped:
- 15 primitive families (button, badge, card, label, input, textarea, separator, skeleton, table, avatar, tabs, dialog, dropdown-menu, select, sheet) lifted from Heroes' `packages/web/src/lib/components/ui/` into `@coms-portal/ui/primitives` verbatim. Heroes' codebase eligible to shrink in a follow-up by deleting local copies and re-importing from `@coms-portal/ui/primitives`.
- HeroGreeting, SummaryCard, NotificationsBadge deliberately NOT lifted — dashboard-specific, not generic. Compositions folder remains stub for future genuinely-shared candidate.
- Future apps onboard with primitives + chrome already in the kit; only domain components live in the app.

Phase 5 covers:
- ONBOARDING.md is exercised by a real third H-app onboarding. Any rough edges patched in the doc and packages.

Phases ship sequentially when triggered; Phase 2 must precede 3, 3 must precede 4. Phase 5 closes the loop.

---

## Risk + Mitigations

| Risk | Mitigation |
|------|-----------|
| Heroes-side regression during chrome migration. | Heroes adopts each chrome component behind a feature flag; flag removal after 7-day soak. |
| Token package extraction breaks Heroes' Tailwind config. | Phase 2 ships the preset alongside the existing config; cutover is a one-line PR per app. |
| Yaml-vs-prose drift recurs. | Prose tables in DESIGN.md are generated from yaml at build time, or duplicated values are removed from prose entirely. |
| Standalone git repos add release friction. | Match the `@coms-portal/shared` workflow exactly — semver tags, no auto-release, consumers pin. Friction is the point: explicit upgrades. |
| Apps fork components instead of upstreaming changes. | ONBOARDING.md includes "if you need a variant, open an issue / PR on `@coms-portal/ui`" — variants land upstream, never as one-off forks. |
| DESIGN.md and packaged components disagree (doc says X, code does Y). | Phase 2+ build pipeline can include a snapshot test: rendered components match the visual spec via Storybook + Chromatic, or at minimum the prop tables in DESIGN.md are generated from the component types. |

---

## Out of Scope

- **Visual redesign.** This spec migrates the existing system; it does not retune colors, typography, or component looks.
- **Storybook / visual regression infra.** Worth doing later; not blocking Phase 1–2.
- **Theming beyond light/dark.** Multi-tenant theming (per-org branding) is a future spec.
- **Non-Svelte consumers.** The packages ship Svelte 5 components only. If a React/Vue H-app ever appears, that's a re-evaluation, not a Spec 02 concern.
- **Iconography package.** Lucide is consumed directly by each app today; no need to wrap. The icon mapping table in DESIGN.md is reference, not a package.

---

## Success Criteria

### Phase 1 (done)

1. `DESIGN.md`, `ONBOARDING.md`, `CHANGELOG.md` exist in the `coms-ui` repo and are the canonical reference. ✅
2. Heroes' `my-design-guideline/DESIGN.md` is a redirect note. ✅
3. Empty package skeletons exist as `github.com/mrdoorba/coms-design-tokens@v0.1.0` and `github.com/mrdoorba/coms-ui@v0.1.0`, consumable via `git+...#v0.1.0`. ✅

### Full Spec 02 (when Phases 2–5 ship)

1. `@coms-portal/design-tokens@1.0.0` is published as a standalone git repo and consumed by both portal and Heroes.
2. `@coms-portal/ui@1.2.0` is published with the four chrome components (v1.0.0) and the 15 primitive families (v1.2.0), consumed by both portal and Heroes.
3. ONBOARDING.md has been exercised by a third H-app onboarding end-to-end with no spec changes required.

These criteria do not have a target date; they're tracked against the triggers in §Migration / Rollout.
