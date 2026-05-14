# Contributing to `@coms-portal/account-widget-svelte`

> This repo ships the shared `AccountWidget` component (avatar dropdown, profile link, sign-out flow) that mounts in the chrome's right slot of every COMS suite app — portal `apps/web`, Heroes, and any future H-app.

## Read this first

The canonical contribution workflow for the COMS design system — decision tree for where to make changes, local-dev loop with `file:` refs, PR format, versioning rules, reviewer expectations — lives at:

→ **[`aha-coms/DESIGN_SYSTEM.md`](https://github.com/AHA-Commerce-CIA-Project/aha-coms/blob/main/DESIGN_SYSTEM.md)**

Read that first. It covers all three shared design-system repos (this one, `coms-ui`, `coms-design-tokens`) and the workflow that spans them.

## Repo-specific notes for `coms-account-widget`

### Local typecheck

```sh
bun install
bun run typecheck
```

Must pass clean before any PR — no `// @ts-ignore` workarounds.

### What this widget owns

- The avatar trigger (initials or image, sized to fit the chrome's right slot).
- The popover (name, email, role, "Manage account" link to portal `/profile`).
- The sign-out flow — RP-initiated OIDC logout against the portal at `/api/auth/logout` with `id_token_hint`.

### What this widget does NOT own

- The chrome's right slot itself — that's `coms-ui/src/chrome/` (`ServiceBar`, `MobileTopBar`).
- Tokens (avatar background color, popover shadow, etc.) — those come from `mrdoorba/coms-design-tokens`.
- Profile editing — Spec 01 deliberately keeps this widget read-only; profile editing is a future Rev.

### Behavior contract

The widget's API is documented at the top of its main `.svelte` file. The widget calls portal's `/api/userinfo` to source its data (since Rev 3 Spec 03c) and is portal-domain-aware via the chrome's existing config plumbing.

### Adding a feature (e.g. notifications inbox slot)

1. Open an issue first to align with portal team. The widget appears in every consumer; UX changes are felt by every user.
2. Author the change. Preserve the existing prop/snippet contract — the chrome of every app passes the widget through, and consumer apps shouldn't need to update their integration to receive a new optional slot.
3. Update `CHANGELOG.md`.
4. Bump `package.json` minor version for additive changes; major for breaking.
5. Tag and push: `git tag -a vX.Y.Z -m "..." && git push origin main && git push origin vX.Y.Z`.
6. Open consumer-side PRs to bump the pin.

### Breaking changes

Renaming a prop, removing a snippet, or changing the userinfo source endpoint = major bump. Migration notes in the CHANGELOG. Discuss in an issue first.

### Commit message format

This repo uses **Mr. Door commit format** — lore-paragraph subject + `What changed` / `Why` / `Verification` body + `Co-Authored-By` trailer. See recent commits for examples (`git log -3 --format=full`).

## Where to NOT put changes

- **Chrome layout** (where the widget mounts) → `mrdoorba/coms-ui` `src/chrome/`, not here.
- **Profile page** (the page the "Manage account" link opens) → portal `apps/web`, not here.
- **Tokens** (avatar background, popover surface) → `mrdoorba/coms-design-tokens`, not here.
- **Authentication endpoints** (the actual `/api/userinfo`, `/api/auth/logout` server logic) → `coms_portal apps/api`, not here.
