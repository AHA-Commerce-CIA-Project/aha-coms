# @coms-portal/account-widget

Shared account widget for the COMS suite. Mounted in the chrome's right slot by every COMS app (portal, Heroes, future H-apps). Renders the avatar + popover (account info, app switcher, sign-out). Implements Rev 3 Spec 01.

> **Status:** v0.1.0 (pre-1.0). API stays at `0.x.y` until Heroes adoption validates the prop surface, then bumps to v1.0.0 per spec-02 §Versioning.

## Install

Production (after the repo is pushed to GitHub with a v0.1.0 tag):

```sh
bun add git+https://github.com/mrdoorba/coms-account-widget.git#v0.1.0
```

Local development (during initial portal dogfooding before the package is pushed):

```jsonc
// apps/web/package.json
"dependencies": {
  "@coms-portal/account-widget": "file:../../../coms-account-widget"
}
```

Swap the `file:` line for the `git+url` form once the package is pushed.

## Use

The widget is presentational — the host loads `user` server-side and passes it down. Mount the widget inside the chrome's `right` snippet:

```svelte
<script lang="ts">
  import { ServiceBar } from '@coms-portal/ui/chrome'
  import { AccountWidget } from '@coms-portal/account-widget'
  import { APP_LAUNCHER } from '@coms-portal/shared'

  let { data } = $props()
  const user = data.user

  const appSwitcher = $derived(
    user.apps
      .map((slug) => ({
        slug,
        label: APP_LAUNCHER[slug]?.label ?? slug,
        url: APP_LAUNCHER[slug]?.url ?? '#',
      }))
      .filter((a) => a.url !== '#'),
  )
</script>

<ServiceBar services={...} currentApp="heroes" theme="dark">
  {#snippet right()}
    <AccountWidget
      currentApp="heroes"
      portalOrigin="https://coms.ahacommerce.net"
      {user}
      {appSwitcher}
    />
  {/snippet}
</ServiceBar>
```

## Props

| Prop | Type | Required | Notes |
|---|---|---|---|
| `currentApp` | `string` | yes | Slug matching an entry in `user.apps`. Drives the "you are here" highlight in the launcher. **Never sniff `window.location`** — set this at compile time or from an env var. |
| `portalOrigin` | `string` | yes | Portal origin (no trailing slash required). Used for the "Manage account" link and the sign-out endpoint. |
| `user` | `{ name, email, portalRole, apps }` | yes | The authenticated user. Loaded server-side by the host. Widget treats `null` as a programming error and renders nothing. |
| `appSwitcher` | `Array<{ slug, label, url }>` | yes | App launcher list. Host derives from `user.apps` ⊗ the slug→URL map in `@coms-portal/shared` (`APP_LAUNCHER`). |
| `postLogoutRedirectUri` | `string` | no | Where the portal redirects after sign-out completes. Defaults to `${window.location.origin}/`. Must be in the portal's app_registry allowlist. |
| `notificationsSlot` | `Snippet` | no | Reserved per spec-01 §Visual Spec for a future notifications-bell area. |

## Sign-out

Sign-out is RP-initiated OIDC logout: the widget calls `signOut()` which performs a top-level browser navigation to `${portalOrigin}/api/auth/logout?post_logout_redirect_uri=…`. The portal validates the redirect URI against its `app_registry` allowlist (with trailing-slash normalization), clears the session cookie, and 303-redirects back. The host app's logged-out handler receives the request and clears its own session.

You can also call `signOut()` directly from outside the widget:

```ts
import { signOut } from '@coms-portal/account-widget'

signOut({
  portalOrigin: 'https://coms.ahacommerce.net',
  postLogoutRedirectUri: 'https://heroes.ahacommerce.net/logged-out',
})
```

## Development

```sh
bun install
bun run typecheck
```

## Visual + token contract

The widget uses Tailwind utility classes (`bg-card`, `text-foreground`, `bg-primary-light/25`, etc.) that resolve through `@coms-portal/design-tokens`. The consuming host must `@import "@coms-portal/design-tokens/css"` in its Tailwind v4 entry point so the utilities resolve correctly.

## Tailwind setup — required

Tailwind v4 excludes `node_modules` from auto-discovery, so AccountWidget's class strings (including responsive ones like `hidden sm:inline`) are invisible to the host's compile step unless the host opts them back in.

This package ships an `@source` directive that opts the widget back into the scanner. Import it once in your Tailwind v4 entry point:

```css
/* apps/web/src/app.css */
@import "tailwindcss";
@import "@coms-portal/ui/styles.css";
@import "@coms-portal/account-widget/styles.css";
@import "@coms-portal/design-tokens/css";
```

You do **not** need to know where this package lives in `node_modules`. The `@source` paths inside `styles.css` are resolved relative to the file itself, so the host's Tailwind plugin scans this package no matter how it is installed (workspace, `file:` link, or `git+url`).
