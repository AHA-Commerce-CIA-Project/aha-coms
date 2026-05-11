# @coms-portal/ui

COMS UI components for the AHA Commerce suite. Consumed by the portal and every H-app.

> **Status:** v1.0.0 ships the chrome shells (`ServiceBar`, `Sidebar`, `MobileTopBar`, `MobileBottomNav`). Primitives and compositions are reserved for future phases (Phase 4 of Rev 3 Spec 02).

## Install

Production (after the repo is pushed to GitHub with a v1.0.0 tag):

```sh
bun add git+https://github.com/mrdoorba/coms-ui.git#v1.0.0
```

Local development (during initial portal dogfooding before the package is pushed):

```jsonc
// apps/web/package.json
"dependencies": {
  "@coms-portal/ui-svelte": "file:../../../coms-ui"
}
```

Swap the `file:` line for the `git+url` form once the package is pushed.

## Layout

```
src/
  primitives/    — (reserved for Phase 4 — empty index.ts today)
  chrome/        — ServiceBar, Sidebar, MobileTopBar, MobileBottomNav
  compositions/  — (reserved for Phase 4 — empty index.ts today)
```

## Use

The chrome shells are presentational and host-agnostic. Each consuming app passes data + state via props and mounts host-specific widgets (notably the account widget) into the right-slot snippets.

### Minimal portal example

```svelte
<script lang="ts">
  import { ServiceBar, Sidebar, MobileTopBar, MobileBottomNav } from '@coms-portal/ui-svelte/chrome'
  import { LayoutDashboard, Users } from 'lucide-svelte'
  import { page } from '$app/stores'

  const navSections = [
    { items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard }] },
    { label: 'Admin', items: [{ href: '/admin/employees', label: 'Employees', icon: Users }] },
  ]

  const services = [
    { slug: 'portal', label: 'COMS' },
    { slug: 'heroes', label: 'Heroes', formAction: '/api/auth/broker/launch/heroes' },
  ]

  let theme = $state<'light' | 'dark'>('dark')
  let collapsed = $state(true)

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }
</script>

<ServiceBar {services} currentApp="portal" {theme} onToggleTheme={toggleTheme}>
  {#snippet right()}
    <!-- mount <AccountWidget> here -->
  {/snippet}
</ServiceBar>

<Sidebar
  sections={navSections}
  currentPath={$page.url.pathname}
  {collapsed}
  onCollapsedChange={(v) => (collapsed = v)}
>
  {#snippet logo({ collapsed })}
    <span class="font-extrabold">{collapsed ? 'C' : 'COMS'}</span>
  {/snippet}
</Sidebar>
```

### Right-slot contract

`ServiceBar` and `MobileTopBar` accept an optional `right` snippet prop. The host renders whatever should appear at the far right — typically `<AccountWidget>`. The chrome itself does not own avatar / sign-out / app-launcher UI; that is widget territory.

### Theme toggle

The chrome ships a presentational theme toggle (sun/moon glyph). The host owns the `theme` state and passes a `theme` value plus an `onToggleTheme` handler. The chrome never reads `localStorage` or DOM classes on its own.

### Tailwind tokens

Chrome components use Tailwind utility classes that resolve through `@coms-portal/design-tokens`. The consuming app must `@import "@coms-portal/design-tokens/css"` in its Tailwind v4 entry point so utilities like `bg-card`, `text-foreground`, `bg-deep-navy`, etc. resolve correctly.

### Tailwind setup — required

Tailwind v4 excludes `node_modules` from auto-discovery, so the chrome components' class strings (`md:hidden`, `hidden md:flex`, `md:ml-[var(--sidebar-width)]`, etc.) are invisible to the host's compile step unless the host opts them back in. **Symptom when this is missing:** the desktop sidebar and the mobile top bar + bottom nav all render simultaneously on every viewport.

This package ships an `@source` directive that opts every component in the package back into the scanner. Import it once in your Tailwind v4 entry point:

```css
/* apps/web/src/app.css */
@import "tailwindcss";
@import "@coms-portal/ui-svelte/styles.css";
@import "@coms-portal/account-widget/styles.css";
@import "@coms-portal/design-tokens/css";
```

Order matters: `@import "tailwindcss"` must come first; the `styles.css` files must come before any `@theme` / `@source` of your own (they are CSS imports and must precede normal rules per the CSS spec).

You do **not** need to know where this package lives in `node_modules`. The `@source` paths inside `styles.css` are resolved relative to the file itself, so the host's Tailwind plugin scans this package no matter how it is installed (workspace, `file:` link, or `git+url`).

If you add new components in this repo, no rebuild is needed — `styles.css` uses a glob (`./**/*.svelte`). Just commit the new component file and consumers pick it up on their next install / dev-server restart.

## Development

```sh
bun install
bun run typecheck     # svelte-check across src/
```

## Component reference

See `DESIGN.md` for the canonical visual specification. The components in `src/chrome/` implement the visual shapes documented there, with host-supplied data filling the slots.
