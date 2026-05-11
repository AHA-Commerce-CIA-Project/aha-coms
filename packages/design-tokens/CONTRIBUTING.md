# Contributing to `@coms-portal/design-tokens`

> This repo ships the canonical CSS variables, `@theme` bindings, and semantic color/spacing/radius/shadow tokens for the COMS suite. Every styled element across portal `apps/web`, Heroes, and `@coms-portal/ui` references these tokens.

## Read this first

The canonical contribution workflow for the COMS design system — decision tree for where to make changes, local-dev loop with `file:` refs, PR format, versioning rules, reviewer expectations — lives at:

→ **[`coms_portal/DESIGN_SYSTEM.md`](https://github.com/mrdoorba/coms-portal/blob/main/DESIGN_SYSTEM.md)**

Read that first. It covers all three shared design-system repos (this one, `coms-ui`, `coms-account-widget`) and the workflow that spans them.

## Repo-specific notes for `coms-design-tokens`

### Folder layout

- `src/tokens.yaml` — canonical source of truth. Edit here.
- `src/tokens.css` — generated CSS with `@theme` blocks (immutable brand palette, status colors, fonts, radii, shadows, spacing) and `@theme inline` semantic bindings (`--color-primary`, `--color-background`, etc.) plus `:root` (light) and `.dark` (dark mode) variable definitions.
- `src/tokens.ts` — generated TypeScript export of the same values.

### Adding or changing a token

1. Edit `src/tokens.yaml`. Match the existing structure (under `colors`, `spacing`, `radii`, `shadows`, etc.).
2. Regenerate `tokens.css` + `tokens.ts` (the build script in `package.json`).
3. Update `CHANGELOG.md` (lives in `coms-ui/CHANGELOG.md` — this repo doesn't have its own; tokens are documented in the suite-wide changelog).
4. Bump `package.json` version:
   - **Patch** (`1.1.0` → `1.1.1`): typo or value correction with no visual impact.
   - **Minor** (`1.1.0` → `1.2.0`): new token (additive).
   - **Major** (`1.1.0` → `2.0.0`): re-tuning an existing token's value (visual impact across every consumer) or removing a token (breaking).
5. Tag and push: `git tag -a vX.Y.Z -m "..." && git push origin main && git push origin vX.Y.Z`.
6. Open consumer-side PRs to bump the pin in each app.

### Discuss before re-tuning existing tokens

Re-tuning an existing token (e.g. shifting `--primary` by a few points) is a major bump because every consumer renders differently afterward. Open an issue first to align: portal team + Heroes UX + any other consumer rep. Most token-PRs are additive; re-tunes are rare and expensive.

### Tokens are NOT for per-app customization

Tokens are suite-wide. If your app needs a per-tenant accent color or per-org branding, that's a per-tenant theming pattern (a future spec), not a token addition.

### Commit message format

This repo uses **Mr. Door commit format** — lore-paragraph subject + `What changed` / `Why` / `Verification` body + `Co-Authored-By` trailer. See recent commits for examples (`git log -3 --format=full`).

## Where to NOT put changes

- **Component changes** (Button variant, Card padding, Dialog animation) → `mrdoorba/coms-ui`, not here.
- **Account widget changes** → `mrdoorba/coms-account-widget`, not here.
- **App-specific styling** → your app's own repo, not here.
- **Per-app brand colors** → not yet supported. Discuss in an issue if you need one.
