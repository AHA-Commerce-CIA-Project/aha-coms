# COMS Design System — Changelog

Version history for the design system reference (this directory) and the published packages (`@coms-portal/design-tokens`, `@coms-portal/ui`, `@coms-portal/account-widget`).

Format: each entry lists the doc revision and any package version that ships alongside it. Breaking changes (major bumps) include a migration section.

---

## Unreleased

- ONBOARDING.md — document the canonical Select-display pattern (`<span>` content inside `<SelectTrigger>`); `SelectValue` is intentionally not exported, mirroring Heroes' source.

---

## v1.2.0 — 2026-04-29

### Packages
- `@coms-portal/ui@1.2.0` — primitives lift. 15 shadcn-svelte v3 primitive families lifted verbatim from `@coms/web` (Heroes) into `src/primitives/`. Import paths rewritten from `$lib/utils.js` → `../../utils.js` and `$lib/components/ui/<family>/index.js` → `../<family>/index.js`. Generic short-name exports (Root, Content, Header…) are flattened out of the public barrel to avoid cross-family name collisions; only fully-qualified aliases (Button, CardContent, DialogContent, etc.) are re-exported. New `src/utils.ts` ships `cn()` + four type helpers (WithoutChildren, WithoutChild, WithoutChildrenOrChild, WithElementRef). New direct deps: `bits-ui ^2.16.3`, `clsx ^2.1.1`, `lucide-svelte ^0.460.0`, `tailwind-merge ^3.5.0`, `tailwind-variants ^3.2.2`. Compositions remain stub — Heroes' compositions are dashboard-specific (brand gradients, gold/silver/bronze scales) and are not generic primitives. `ONBOARDING.md` Step 4 import example corrected: `StatusBadge` → `Badge`.

Families shipped:
- `Avatar` (Root, Image, Fallback, Badge, Group, GroupCount)
- `Badge` (Badge, badgeVariants)
- `Button` (Button, buttonVariants, ButtonProps, ButtonSize, ButtonVariant)
- `Card` (Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, CardAction)
- `Dialog` (Dialog + 9 sub-components)
- `DropdownMenu` (DropdownMenu + 16 sub-components)
- `Input`
- `Label`
- `Select` (Select + 10 sub-components)
- `Separator`
- `Sheet` (Sheet + 9 sub-components)
- `Skeleton`
- `Table` (Table + 7 sub-components)
- `Tabs` (Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants)
- `Textarea`

---

## v1.1.0 (historical)

### Docs
- Initial extraction from `coms_aha_heroes/my-design-guideline/DESIGN.md` into `coms_portal/docs/design-system/` as the canonical source.
- Added `ONBOARDING.md` (integration playbook) and `CHANGELOG.md` (this file).
- Frontmatter `version: alpha` → `version: 1.0`. Frontmatter is now declared the single source of truth for token values.
- Component sections rewritten to reference `@coms-portal/ui` components instead of describing implementation details.

### Packages
- `@coms-portal/design-tokens@0.0.0` — package skeleton; not yet published.
- `@coms-portal/ui@1.1.0` — adds `./styles.css` export. Hosts must `@import "@coms-portal/ui/styles.css"` in their Tailwind v4 entry point so `node_modules` chrome class strings (`md:hidden`, `hidden md:flex`, `md:ml-[var(--sidebar-width)]`, etc.) are scanned. Without this, the desktop sidebar and mobile chrome render simultaneously on every viewport. No code change to the components themselves — purely the source-registration contract. See README "Tailwind setup — required".
- `@coms-portal/account-widget@0.0.0` — package skeleton; defined in Rev 3 Spec 01.

### Migration notes
- Heroes' `my-design-guideline/DESIGN.md` is reduced to a redirect note. Any references to that path in Heroes' codebase should be updated to point at `coms_portal/docs/design-system/DESIGN.md`.

---

## Versioning policy

- **0.x.y** — pre-1.0 development. Breaking changes allowed in minor bumps, documented here.
- **1.0.0** — first stable release. Cuts when both portal and Heroes consume the package and have run in production for 7+ days.
- **Post-1.0 majors** — breaking changes require a major bump, a migration section in this changelog, and explicit upgrade PRs in each consumer.
- **Minors** — additive changes (new components, new variants, new tokens that don't override existing ones).
- **Patches** — bug fixes, visual tweaks within the same intent (e.g. shadow rgba adjustment), no API changes.

Consumers pin by tag (`git+...#vX.Y.Z`). No automatic updates.
