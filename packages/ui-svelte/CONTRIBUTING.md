# Contributing to `@coms-portal/ui`

> This repo ships chrome shells (ServiceBar, Sidebar, MobileTopBar, MobileBottomNav) and 15 shadcn-style primitive families (Button, Card, Dialog, DropdownMenu, Select, Sheet, Tabs, Avatar, Badge, Input, Label, Table, Textarea, Separator, Skeleton) for the COMS suite. Every styled element across portal `apps/web` and Heroes flows through this package.

## Read this first

The canonical contribution workflow for the COMS design system — decision tree for where to make changes, local-dev loop with `file:` refs, PR format, versioning rules, reviewer expectations — lives at:

→ **[`coms_portal/DESIGN_SYSTEM.md`](https://github.com/mrdoorba/coms-portal/blob/main/DESIGN_SYSTEM.md)**

Read that first. It covers all three shared design-system repos (this one, `coms-design-tokens`, `coms-account-widget`) and the workflow that spans them.

## Repo-specific notes for `coms-ui`

### Local typecheck

```sh
bun install
bun run typecheck
```

`typecheck` runs `svelte-check --tsconfig ./tsconfig.json`. Must pass clean before any PR — no `// @ts-ignore` workarounds.

### Folder layout

- `src/primitives/` — 15 shadcn-style primitive families. Lifted verbatim from Heroes' `packages/web/src/lib/components/ui/` 2026-04-29; future changes happen here, not in any consumer.
- `src/chrome/` — ServiceBar, Sidebar, MobileTopBar, MobileBottomNav.
- `src/compositions/` — currently a stub. Compositions land here when a generic candidate appears (Heroes' `HeroGreeting`/`SummaryCard`/`NotificationsBadge` were deliberately not lifted — they are dashboard-specific).
- `src/utils.ts` — `cn()` helper + four shadcn-svelte type helpers.
- `src/styles.css` — Tailwind v4 `@source` directive. Consumers must `@import "@coms-portal/ui/styles.css"` in their entry CSS.

### Adding a primitive

1. Author the family at `src/primitives/<family>/<file>.svelte` + `src/primitives/<family>/index.ts`.
2. Re-export the public names from `src/primitives/index.ts` using fully-qualified aliases (e.g. `Checkbox`, `CheckboxGroup`) — do NOT use `export *` because generic names (Root, Content, Header) collide across families.
3. Update `ONBOARDING.md` Step 4 import example if relevant.
4. Update `CHANGELOG.md` with the new family.
5. Bump `package.json` minor version (e.g. `1.2.0` → `1.3.0`). Adding a primitive is additive.
6. Tag and push: `git tag -a vX.Y.Z -m "..." && git push origin main && git push origin vX.Y.Z`.
7. Open consumer-side PRs to bump the pin.

### Adding a variant to an existing primitive

1. Edit the family's `*.svelte` file (usually adding to a `tailwind-variants` `tv()` config).
2. Update `CHANGELOG.md`.
3. Bump minor version (additive variant).
4. Tag and push.

### Breaking changes

Removing a prop, renaming a primitive, or changing a default that affects rendering = major bump (`1.x.y` → `2.0.0`). Migration notes must be in the CHANGELOG entry. Discuss in an issue first — every consumer pays the upgrade cost.

### Commit message format

This repo uses **Mr. Door commit format** — a lore-paragraph subject in the voice of the codebase author + structured `What changed` / `Why` / `Verification` body + `Co-Authored-By` trailer. See recent commits for examples (`git log -3 --format=full`). Match the established voice; the lore subjects connect across repos and across the design-system arc.

## Where to NOT put changes

- **Token changes** (colors, spacing, radii, fonts, shadows) → `mrdoorba/coms-design-tokens`, not here. Primitives reference tokens via semantic Tailwind classes (`bg-card`, `text-foreground`).
- **Account widget changes** → `mrdoorba/coms-account-widget`, not here.
- **App-specific styling** → your app's own repo, not here.

## Discussion before PR

For non-trivial changes, open an issue first. Most "I think this could be better" intuitions need calibration against constraints from other consumer apps (portal, Heroes, future H-apps). The portal team or another consumer's UX lead will tell you "yes, do that" or "here's a constraint you don't see from your side." This saves rejected PRs.

For trivial fixes (typo, obvious bug, lint), skip the issue and open the PR directly.
