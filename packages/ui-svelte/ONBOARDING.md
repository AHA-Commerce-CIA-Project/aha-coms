# COMS Design System — Onboarding

> Integration playbook for a new H-app (Heroes, etc.).
> For visual reference, see [`DESIGN.md`](./DESIGN.md).
> For version history, see [`CHANGELOG.md`](./CHANGELOG.md).

---

## Prerequisites

- Svelte 5 (the design-system packages ship Svelte components only).
- Tailwind CSS 4 (the token package distributes a Tailwind preset).
- The app is registered with the portal as a relying party (Rev 1 Spec 02 — talk to the portal team).
- The app's slug is decided and added to the portal's app registry.

---

## Step 1 — Install the packages

```bash
bun add @coms-portal/design-tokens @coms-portal/ui @coms-portal/account-widget
```

All three packages ship from standalone GitHub repos and are pinned by tag (matching the existing `@coms-portal/shared` distribution model). Pin to the latest released minor.

---

## Step 2 — Import the tokens

In your app entry (`src/app.css` or equivalent):

```css
@import '@coms-portal/design-tokens/css';
```

Tailwind config:

```js
import comsPreset from '@coms-portal/design-tokens/tailwind'

export default {
  presets: [comsPreset],
  // app-specific extensions go here
}
```

Load Manrope (see DESIGN.md §Font loading).

---

## Step 3 — Mount the four chrome shells

Every COMS app is required to render all four chrome elements. Each is a component from `@coms-portal/ui/chrome` that takes app-specific data via props.

In your root layout (e.g. `src/routes/+layout.svelte`):

```svelte
<script lang="ts">
  import {
    ServiceBar,
    Sidebar,
    MobileTopBar,
    MobileBottomNav,
  } from '@coms-portal/ui/chrome'
  import { AccountWidget } from '@coms-portal/account-widget'
  import { PUBLIC_PORTAL_ORIGIN } from '$env/static/public'
  import { TrophyIcon } from 'lucide-svelte'

  // App-specific config
  const APP_SLUG = 'heroes'    // ← your app's slug
  const APP_NAME = 'AHA HEROES'
  const APP_LOGO = TrophyIcon

  // App-specific nav items
  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboardIcon },
    { href: '/points', label: 'Points', icon: AwardIcon },
    { href: '/leaderboard', label: 'Leaderboard', icon: TrophyIcon },
    { href: '/rewards', label: 'Rewards', icon: GiftIcon },
  ]
  const adminItems = [
    { href: '/admin/users', label: 'Users', icon: UsersIcon },
    // ...
  ]
  const mobileNavItems = [
    { href: '/dashboard', label: 'Home', icon: HomeIcon },
    { href: '/points', label: 'Points', icon: AwardIcon },
    { href: '/leaderboard', label: 'Rank', icon: TrophyIcon },
    { href: '/rewards', label: 'Rewards', icon: GiftIcon },
    { href: '/profile', label: 'Profile', icon: UserIcon },
  ]

  // Shared services list (from @coms-portal/shared)
  // Eventually will come from a portal endpoint; for now, hardcoded.
  const services = [
    { slug: 'portal', label: 'COMS', url: 'https://portal.example' },
    { slug: 'heroes', label: 'Heroes', url: 'https://heroes.example' },
    // ...
  ]

  let { data } = $props()  // contains user from server load
</script>

<ServiceBar {services} currentApp={APP_SLUG}>
  {#snippet right()}
    <AccountWidget
      currentApp={APP_SLUG}
      portalOrigin={PUBLIC_PORTAL_ORIGIN}
      user={data.user}
      appSwitcher={services}
    />
  {/snippet}
</ServiceBar>

<Sidebar
  appName={APP_NAME}
  appLogo={APP_LOGO}
  {navItems}
  {adminItems}
  user={data.user}
/>

<MobileTopBar appName={APP_NAME} appLogo={APP_LOGO}>
  {#snippet right()}
    <AccountWidget
      currentApp={APP_SLUG}
      portalOrigin={PUBLIC_PORTAL_ORIGIN}
      user={data.user}
      appSwitcher={services}
    />
  {/snippet}
</MobileTopBar>

<MobileBottomNav items={mobileNavItems} />

<main>
  {@render children?.()}
</main>
```

That's the entire chrome integration. Every other app uses the same structure with their own `APP_SLUG`, `APP_NAME`, and nav lists.

---

## Step 4 — Use primitives for everything else

In your app's pages and components, import primitives from `@coms-portal/ui/primitives`:

```svelte
<script lang="ts">
  import { Button, Card, Badge, Avatar } from '@coms-portal/ui/primitives'
</script>

<Card>
  <Avatar size="md" name="Alice" />
  <Button variant="blue" onclick={submit}>Submit</Button>
  <Badge variant="outline">approved</Badge>
</Card>
```

Page layouts, routes, business logic, and domain components (your equivalent of Heroes' Leaderboard, etc.) live entirely in your app — the design system does not constrain those.

### Step 4a — Select: displaying the current value

`Select` (and `SelectTrigger`) does not ship a `SelectValue` component. To display the current selection inside the trigger, render any markup (typically a `<span>`) as the trigger's child — Svelte's snippet shape carries through. Pattern:

```svelte
<Select type="single" value={form.role} onValueChange={(v) => form.role = v}>
  <SelectTrigger>
    <span>{form.role || 'Pick a role'}</span>
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="admin">Admin</SelectItem>
    <SelectItem value="member">Member</SelectItem>
  </SelectContent>
</Select>
```

This is consistent with Heroes' `select/index.ts` — `SelectValue` is intentionally absent from the export surface. The `<span>` (or any element) inside `<SelectTrigger>` is the display value.

---

## Step 5 — Verify

- All chrome renders at the right z-index (service bar above mobile top bar above page content).
- Light mode and dark mode both work — toggle and confirm every surface.
- The account widget popover opens, shows the right user, and "Manage account" deep-links to portal `/profile`.
- Sign-out from the widget ends the portal session and your app's session.
- The mobile bottom nav highlights the current route correctly.
- Manrope is loaded (no font flash to system serif).

---

## Step 6 — Register with the portal

- Add your app's slug to the portal's app registry (the portal team handles this).
- Register your origin in the portal's `post_logout_redirect_uri` allowlist (Spec 01 §Logout).
- Confirm OIDC client credentials are issued and your app verifies tokens via the portal's JWKS endpoint (Rev 2 Spec 01).

---

## Step 7 — When you need a new component or variant

**Don't** add it inline in your app. Open a PR on `@coms-portal/ui` to add the component or variant upstream, then bump your dependency. This is how the suite stays consistent — every variant lands in one place.

If you need a temporary shim while the upstream PR is in review, add it under `src/lib/_temp-design-shims/` in your app and remove it immediately when the upstream version ships.

---

## Onboarding checklist (for the new H-app team lead)

- [ ] App slug decided and added to portal app registry
- [ ] OIDC client credentials issued by portal team
- [ ] Origin added to portal's logout-redirect allowlist
- [ ] `@coms-portal/design-tokens`, `@coms-portal/ui`, `@coms-portal/account-widget` installed and pinned
- [ ] Tailwind preset wired up
- [ ] Manrope loaded
- [ ] Four chrome shells mounted in root layout with app-specific props
- [ ] Account widget mounted in service bar + mobile top bar slots
- [ ] Light/dark mode toggle verified on every surface
- [ ] Sign-out cascades correctly (portal session ends; app session ends)
- [ ] Read DESIGN.md end-to-end before building first page
- [ ] First domain page built using only primitives + chrome — no reimplemented components
