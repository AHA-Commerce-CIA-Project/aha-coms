# Rev 3 Spec 01 + Spec 02 — Heroes integration handoff

> Audience: the Heroes team. You have read spec-01 and spec-02; this document tells you what to do in `coms_aha_heroes/` to adopt the three packages we just shipped portal-side.
>
> **Prepared:** 2026-04-28 (post-portal-implementation pass). **Portal status:** all three packages exist on disk in sibling repos; portal `apps/web` consumes them; the widget is mounted in the chrome's right slot and dogfooded in the portal layout. Tests + builds green.

---

## Status of the three packages

All three live as standalone GitHub repos per the user's standing rule (`@coms-portal/*` packages distributed via `git+url`, never workspace deps). At handoff time they are **on local disk only** — the portal `apps/web` consumes them via `file:` paths during the dogfood phase. Two user-side actions land before Heroes adoption:

| Repo | Local path (today) | GitHub (planned) | Tag |
|---|---|---|---|
| `@coms-portal/design-tokens` | `/Users/mac/HT/Project/coms-design-tokens/` | `github.com/mrdoorba/coms-design-tokens` | `v1.0.0` |
| `@coms-portal/ui` | `/Users/mac/HT/Project/coms-ui/` | `github.com/mrdoorba/coms-ui` | `v1.0.0` |
| `@coms-portal/account-widget` | `/Users/mac/HT/Project/coms-account-widget/` | `github.com/mrdoorba/coms-account-widget` | `v0.1.0` (pre-1.0 until Heroes adoption validates the API) |

`@coms-portal/shared` was bumped to **v1.3.0** locally to add the `APP_LAUNCHER` slug→URL constant (per spec-01 §Open Question 2). Same `git push` → tag → swap pattern applies.

### User-side actions before Heroes can adopt

1. **`git push`** each of the four repos (design-tokens, ui, account-widget, shared) to their GitHub remotes with the tags above.
2. **Swap portal `apps/web/package.json`** from the four `file:` lines back to `git+https://...#vX.Y.Z` lines (also documented inside each repo's README).
3. **Hand this doc to the Heroes team** with a "you're cleared to start" message.

Until step 1 lands, the `bun add` lines in the next section are forward-looking — Heroes cannot install from URLs that aren't yet pushed.

---

## What Heroes installs

```sh
bun add git+https://github.com/mrdoorba/coms-shared.git#v1.3.0
bun add git+https://github.com/mrdoorba/coms-design-tokens.git#v1.0.0
bun add git+https://github.com/mrdoorba/coms-ui.git#v1.0.0
bun add git+https://github.com/mrdoorba/coms-account-widget.git#v0.1.0
```

`@coms-portal/shared` is bumped from whatever Heroes currently pins to v1.3.0 to pick up `APP_LAUNCHER`. The other three are new dependencies for Heroes.

---

## What Heroes does, in order

### Step 1 — Wire the design-tokens import in Heroes' Tailwind v4 entry CSS

Find Heroes' equivalent of `apps/web/src/app.css` (likely `packages/web/src/app.css`). Add the token import directly after the `@import "tailwindcss"` line:

```css
@import "tailwindcss";
@import "@coms-portal/design-tokens/css";
```

This loads the suite-wide `@theme` block (brand + status colors, fonts, spacing, radii, shadows), the `@theme inline` semantic-color bindings, and the `:root` light-mode + `.dark` dark-mode CSS variables.

If Heroes' app.css currently inlines its own `@theme` block, remove the duplicated brand-color and shadow definitions (the import provides them) but keep any Heroes-specific utility classes (gradient buttons, leaderboard styles, animations) — the token package owns suite-wide surfaces, not app-specific utility layers.

### Step 2 — Migrate Heroes' chrome to `@coms-portal/ui/chrome`

Heroes today has these layout components in `packages/web/src/lib/components/layout/`:

| Heroes file | Replacement | Notes |
|---|---|---|
| `ServiceBar.svelte` | `import { ServiceBar } from '@coms-portal/ui/chrome'` | Chrome's `right` snippet is the widget mount point |
| `Sidebar.svelte` | `import { Sidebar } from '@coms-portal/ui/chrome'` | Pass `sections`, `currentPath`, `collapsed`, `onCollapsedChange`; provide `logo` snippet (Heroes' trophy + AHA HEROES wordmark); footer snippet now renders nothing (widget owns avatar / sign-out) |
| `TopBar.svelte` (Heroes' mobile top bar) | `import { MobileTopBar } from '@coms-portal/ui/chrome'` | Renamed per spec-02 line 168. Pass `theme`, `onToggleTheme`, `brand` snippet, optional `leading` (hamburger), `trailing` (search/notifications), and `right` (widget mount) |
| `MobileNav.svelte` | `import { MobileBottomNav } from '@coms-portal/ui/chrome'` | Renamed per spec-02 line 168. Pass `items`, `currentPath` |
| `Header.svelte` (Heroes' desktop search/notifications bar) | **No replacement** — stays Heroes-local | This is app-level (search + i18n + notifications); chrome scope deliberately excludes it |

After migration the four lifted Heroes files can be **deleted**. `Header.svelte` stays.

### Step 3 — Mount the account widget in ServiceBar's right slot

```svelte
<script lang="ts">
  import { ServiceBar, MobileTopBar } from '@coms-portal/ui/chrome'
  import { AccountWidget } from '@coms-portal/account-widget'
  import { APP_LAUNCHER } from '@coms-portal/shared'
  import { PUBLIC_PORTAL_ORIGIN } from '$env/static/public'

  let { user } = $props() // server-loaded from the OIDC session

  const widgetAppSwitcher = $derived(
    user.apps
      .map((slug) => {
        const entry = APP_LAUNCHER[slug]
        return entry ? { slug, label: entry.label, url: entry.url } : null
      })
      .filter((e) => e !== null),
  )
</script>

<ServiceBar
  services={[
    { slug: 'portal', label: 'COMS', href: PUBLIC_PORTAL_ORIGIN },
    { slug: 'heroes', label: 'Heroes' }, // active tab — no link, the bar marks current
  ]}
  currentApp="heroes"
  theme={uiState.theme}
  onToggleTheme={() => uiState.setTheme(uiState.theme === 'dark' ? 'light' : 'dark')}
>
  {#snippet right()}
    <AccountWidget
      currentApp="heroes"
      portalOrigin={PUBLIC_PORTAL_ORIGIN}
      user={{
        name: user.name,
        email: user.email,
        portalRole: user.portalRole,
        apps: user.apps,
      }}
      appSwitcher={widgetAppSwitcher}
    />
  {/snippet}
</ServiceBar>
```

For `MobileTopBar`, mount the same `<AccountWidget>` snippet inside the `right` slot.

### Step 4 — Delete obsolete Heroes-side surfaces

The widget now owns avatar, profile link, app switcher, and sign-out. Remove their Heroes-side counterparts:

- `ServiceBar.svelte` (Heroes' version): the right-side avatar + name + dark-toggle pair (lines 35-67 of Heroes' file). The dark-toggle moves into the chrome `theme` / `onToggleTheme` props; the avatar becomes the widget.
- `TopBar.svelte` (Heroes' mobile top bar): the avatar `<a href="/profile">` link (lines 124-144 of Heroes' file). Widget popover's "Manage account" replaces it.
- `MobileNav.svelte` (Heroes' bottom nav): the `/profile` nav item (line 11 of Heroes' file). Widget popover replaces it.
- Any inline "Sign out" button (Heroes' Sidebar footer or settings page). Widget popover's Sign out replaces it.

### Step 5 — Wire RP-initiated logout

The widget's Sign out button calls `signOut()` which performs a top-level browser navigation to `${portalOrigin}/api/auth/logout?post_logout_redirect_uri=…`. The portal validates the redirect URI against `app_registry.url` (with trailing-slash normalization on both sides), clears the session cookie, and 303-redirects back to the validated target.

For this to work end-to-end, Heroes needs a logged-out landing page (or just `/`) that, when reached via the portal's redirect, **clears Heroes' own session cookie** as well. This is the "host-side post-logout handler" called out in spec-01 §Heroes-Side Changes step 3.

`PUBLIC_PORTAL_ORIGIN` env var: set this to `https://coms.ahacommerce.net` (planned subdomain — currently the production Cloud Run URL). Heroes already references this constant elsewhere; just ensure the widget receives it.

### Step 6 — Optional flag-gating for the soak period

Per spec-01 §Migration / Rollout Phase 2, the Heroes header refactor lands behind a per-deploy flag (`HEROES_USE_PORTAL_ACCOUNT_WIDGET`) for the first 7 days, then the flag is removed. This is Heroes-team latitude — not strictly required.

---

## Widget props at a glance

| Prop | Required | Example |
|---|---|---|
| `currentApp: string` | yes | `"heroes"` |
| `portalOrigin: string` | yes | `"https://coms.ahacommerce.net"` |
| `user: { name, email, portalRole, apps }` | yes | server-loaded from Heroes' OIDC session |
| `appSwitcher: Array<{ slug, label, url }>` | yes | derived from `user.apps` ⊗ `APP_LAUNCHER` |
| `postLogoutRedirectUri: string` | no | defaults to `${window.location.origin}/`; pass an explicit `/logged-out` route if Heroes wants a branded splash |
| `notificationsSlot: Snippet` | no | reserved for spec-01 §Visual Spec future notifications-bell area |

---

## What to verify after adoption (mirrors spec-00 §Success Criteria items 1-4)

A short post-adoption checklist Heroes runs after the soak period closes:

- [ ] **Widget renders identically in portal and Heroes from one package version.** Open both apps side-by-side; the popover shape, the app-switcher highlight, and the role chip should match.
- [ ] **App switcher contains the correct apps.** A user with `apps: ['heroes']` sees only Heroes; a user with `apps: ['heroes', 'orbit']` sees both. Apps not in the user's claim never appear.
- [ ] **Sign-out from inside Heroes ends both sessions.** Click Sign out in the widget while in Heroes → portal session cookie gone (verify by visiting `${portalOrigin}/profile` → 303 to login) AND Heroes session cookie gone (verify by visiting any authed Heroes page → 303 to login).
- [ ] **Manage account from inside Heroes lands on portal /profile.** Click "Manage account" → top-level navigation to `${portalOrigin}/profile`, portal session cookie carries (same-site=lax), profile page renders without a re-login.
- [ ] **Allowlist enforcement works.** From a non-allowlisted origin, a request to `GET ${portalOrigin}/api/auth/logout?post_logout_redirect_uri=https://attacker.example` returns 400 (not silent fall-through).
- [ ] **Theme toggle still works.** Click the sun/moon glyph in the ServiceBar → page palette flips light/dark; preference persists across reload.

---

## Notes for the Heroes team

- **Visual delta vs. prior Heroes palette.** The token package emits hex from `tokens.yaml` (the canonical source per spec-02 line 75). Heroes' prior values may have been close-but-not-identical hex / oklch; expect a small visible shift in dark mode (most noticeable on `--primary` and `--background`). If the shift is judged too aggressive on visual review, the unwind is a yaml edit on `coms-design-tokens/src/tokens.yaml` followed by `bun run build` and a fresh tag — **not a code change in any consumer**. The yaml is the single source.
- **Spec 03 §F display-name fallback**: portal's `/api/userinfo` reads `identity_users.name` directly with a `TODO(spec-03)` comment marking where the `is_primary` fallback (with `ORDER BY created_at DESC LIMIT 1` belt-and-suspenders) lands when Spec 03 ships the `user_aliases` table. The widget consumes the userinfo response as-is; no widget-side change needed when Spec 03 lands — only the portal handler changes.
- **`coms-shared` v1.3.0** is the version that has `APP_LAUNCHER`. v1.2.0 (current portal `apps/api` pin) does not. Bump Heroes' pin too if Heroes was on a sibling version.
- **Service-bar tabs vs widget popover apps** are intentional duplication per spec-01 §Service-bar list vs. popover app list — both, by design. Don't try to deduplicate them in either Heroes or portal; they serve different latencies (instant tab vs richer popover).
- **The widget package is `0.1.0`, not `1.0.0`.** Per spec-02 §Versioning + per the user's instruction, the widget stays at `0.x.y` until Heroes adoption validates the API. Once Heroes ships and runs in production for 7+ days, the widget bumps to `1.0.0`. Until then, breaking changes can land in minor bumps.
