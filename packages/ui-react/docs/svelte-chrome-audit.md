# Svelte Chrome Surface Audit (input to T51 React port)

> Authored at T50 (Spec 05 Phase 1) on 2026-05-13.
> Source authority: `packages/ui-svelte/src/chrome/`,
> `packages/ui-svelte/src/primitives/sheet/`,
> `packages/account-widget-svelte/src/`.
> The Svelte components are the contract; the React port mirrors this surface.

The chrome library is host-agnostic by design (the layouts in `apps/heroes-web/` and `apps/portal-web/` are the only consumers in-tree today). Each app loads `user` + `appCatalog` server-side, derives the chrome inputs, and passes them down. The chrome never calls portal endpoints itself — sign-out is the sole non-presentational action, handled by a top-level browser navigation in `@coms-portal/account-widget-svelte/sign-out.ts`.

This document inventories the seven chrome components plus three glue helpers. Each entry lists props, snippet slots (Svelte's named-content shape — they become React `children` or render-prop callbacks), event callbacks, responsive split points, theme variants, and any non-obvious behavioural quirks that must survive the React port.

## Translation conventions (Svelte → React)

| Svelte construct                                  | React equivalent                                              |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `$props()` rune                                   | function-component `props` arg with `interface Props`         |
| `Snippet` named slot (no args)                    | `React.ReactNode` prop                                        |
| `Snippet<[{ collapsed }]>` slot with arg          | render-prop callback: `(arg) => React.ReactNode`              |
| `$bindable(false)` two-way prop                   | controlled pair: `open: boolean` + `onOpenChange(next)`       |
| `$state(false)` local reactive                    | `useState(false)`                                             |
| `$derived(expr)`                                  | `useMemo(() => expr, [...deps])` or inline                    |
| `$effect(() => { … })`                            | `useEffect(() => { … }, [...deps])`                           |
| `onclick={fn}` DOM event                          | `onClick={fn}`                                                |
| `<svelte:window onkeydown={fn}>`                  | `useEffect(() => { window.addEventListener('keydown', fn); … })` |
| Lucide `Component` icon prop (`@lucide/svelte`)   | `LucideIcon` from `lucide-react` — same icon names            |
| `bits-ui` `Dialog.*` primitive set                | `@radix-ui/react-dialog` — same `Root/Portal/Overlay/Content/Trigger/Close/Title/Description` shape |
| Tailwind utility classes                          | identical strings; design tokens via `@coms-portal/design-tokens/css` |

The React port keeps prop names byte-identical wherever the Svelte name lands cleanly in React (`currentApp`, `currentPath`, `theme`, `sections`, `items`, `appSwitcher`, `user`, `portalOrigin`, `postLogoutRedirectUri`). The few cases where idiom forces a rename are called out per-component.

---

## 1. ServiceBar

File: `packages/ui-svelte/src/chrome/ServiceBar.svelte` (101 lines).
Purpose: top suite chrome — service tabs (cross-app launcher row) + theme toggle + account-widget mount point.

### Props

| Name            | Type                                                                                         | Required | Default   | Behaviour |
| --------------- | -------------------------------------------------------------------------------------------- | -------- | --------- | --------- |
| `services`      | `ServiceItem[]`                                                                              | no       | `[]`      | Service tabs rendered in order. Each item: `{ slug, label, href?, formAction? }`. |
| `currentApp`    | `string`                                                                                     | **yes**  | —         | Slug of host app. Matching tab gets active styling (background `bg-white/10`, label `text-white`, no link/form — rendered as a `<div>`). |
| `theme`         | `ThemePreference` = `'system' \| 'light' \| 'dark'`                                          | no       | `'light'` | Theme preference; `'system'` collapses to `'light'` for the toggle icon (sun shown when resolved=`dark`, moon when resolved=`light`). |
| `onToggleTheme` | `() => void`                                                                                 | no       | —         | When provided, the toggle button renders. When omitted, no toggle button is rendered (the right side collapses to just the right-snippet content). |
| `right`         | `Snippet` (no args)                                                                          | no       | —         | Right-slot mount point — host renders the account widget here. |

### ServiceItem variants (rendered by `{#each}`)

- `slug === currentApp` → non-interactive `<div>` with active styling.
- `formAction` present (and not active) → wrapped in `<form method="POST" action={formAction}>` + `<button type="submit">`. Used by portal's broker-launch flow for cross-app navigation that needs a server-side handoff (e.g. portal's `formAction='/api/auth/broker/launch/<slug>'`).
- Neither → plain `<a href={href}>`.

### Responsive split point

- `hidden md:flex` — the entire ServiceBar is **desktop-only**. On mobile, MobileTopBar handles the suite navigation.

### Visual / structural anchors

- Fixed top-of-viewport: `fixed top-0 left-0 right-0 z-[70] h-9`.
- Gradient background: `bg-gradient-to-r from-deep-navy to-primary-dark border-b border-white/8`.
- Inline SVG sun/moon glyphs (Lucide is **not** imported here — the bar self-contains its icons per `// Lucide is consumed directly by each app per spec-02 §Out of Scope` comment).
- Each tab: `h-6 px-2.5 rounded text-[11px] font-semibold`.

### React port shape

```ts
interface ServiceItem {
  slug: string;
  label: string;
  href?: string;
  formAction?: string;
}

interface ServiceBarProps {
  services?: ServiceItem[];
  currentApp: string;
  theme?: ThemePreference;
  onToggleTheme?: () => void;
  right?: React.ReactNode;
}
```

The `right` slot translates to `React.ReactNode` (no slot args). The `formAction` rendering is the same shape in React — `<form method="POST" action={…}><button type="submit">…</button></form>` works identically.

---

## 2. Sidebar

File: `packages/ui-svelte/src/chrome/Sidebar.svelte` (98 lines).
Purpose: desktop vertical nav, collapses on mouseleave / expands on mouseenter.

### Props

| Name                 | Type                                            | Required | Default | Behaviour |
| -------------------- | ----------------------------------------------- | -------- | ------- | --------- |
| `sections`           | `NavSection[]`                                  | no       | `[]`    | Grouped nav items. Each section: `{ label?: string; items: NavItem[] }`. |
| `currentPath`        | `string`                                        | no       | `''`    | Drives active-link detection. `isActive('/')` matches exact `'/'`; otherwise matches `currentPath === href \|\| currentPath.startsWith(href + '/')`. |
| `collapsed`          | `boolean`                                       | no       | `true`  | Render mode. Collapsed: `w-16`, icon-only, items centred. Expanded: `w-64`, label visible. |
| `onCollapsedChange`  | `(next: boolean) => void`                       | no       | —       | Fired by `onmouseenter` (passes `false`) and `onmouseleave` (passes `true`). The host owns the state — this is a controlled-component pattern; if the host omits this callback, the sidebar stays in whatever `collapsed` value it received (no internal state). |
| `logo`               | `Snippet<[{ collapsed: boolean }]>`             | no       | —       | Top-of-sidebar slot. Receives the current `collapsed` flag so the host can swap the brand mark between full-name and icon-only renders. |
| `footer`             | `Snippet<[{ collapsed: boolean }]>`             | no       | —       | Bottom-of-sidebar slot. Same `{ collapsed }` arg. Portal mounts the account widget here; Heroes mounts a user-info block. |

### NavItem shape

```ts
interface NavItem {
  href: string;
  label: string;
  icon: Component; // @lucide/svelte Component (Svelte 5 native)
}
```

In React: `icon: LucideIcon` from `lucide-react`. The icon is rendered as `<item.icon class="h-[18px] w-[18px] shrink-0" />` — the React idiom is `<item.icon className="h-[18px] w-[18px] shrink-0" />` (Lucide React icons are function components that accept `className` + `size`).

### NavSection shape

```ts
interface NavSection {
  label?: string;        // section heading, optional
  items: NavItem[];
}
```

Section header behaviour: only rendered for `sectionIdx > 0` (the first section is unlabeled). When collapsed, the header collapses to a `border-t` divider; when expanded, the label renders as `<span class="section-label text-muted-foreground/50">`.

### Responsive split point

- `hidden md:flex` — desktop-only. Mobile uses MobileTopBar + MobileBottomNav + (optionally) SlideOverNav.

### Visual / structural anchors

- Fixed: `fixed top-9 left-0 z-40 h-[calc(100vh-2.25rem)]` (lives below the 36px-tall ServiceBar).
- Transition: `transition-[width] duration-200`.
- Background: `bg-card border-r border-border`.
- Active link class: `sidebar-link-active` (defined in app-level CSS — the chrome assumes the host sheet provides this rule. Document this dependency for the React port consumer.)
- Role + aria: `role="navigation"` + `aria-label="Main navigation"`.

### React port shape

```ts
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

interface SidebarProps {
  sections?: NavSection[];
  currentPath?: string;
  collapsed?: boolean;
  onCollapsedChange?: (next: boolean) => void;
  logo?: (args: { collapsed: boolean }) => React.ReactNode;
  footer?: (args: { collapsed: boolean }) => React.ReactNode;
}
```

`logo` and `footer` translate to render-prop callbacks (the cleanest React equivalent of slot-with-args).

---

## 3. MobileTopBar

File: `packages/ui-svelte/src/chrome/MobileTopBar.svelte` (79 lines).
Purpose: mobile top chrome — leading slot (hamburger), brand mark, theme toggle, trailing icons, account widget.

### Props

| Name            | Type                                                                | Required | Default   | Behaviour |
| --------------- | ------------------------------------------------------------------- | -------- | --------- | --------- |
| `theme`         | `ThemePreference`                                                   | no       | `'light'` | Same semantics as ServiceBar. |
| `onToggleTheme` | `() => void`                                                        | no       | —         | When provided, theme toggle button renders. |
| `brand`         | `Snippet` (no args)                                                 | no       | —         | Brand-mark slot. Portal renders "C / COMS", Heroes renders "trophy / AHA HEROES". |
| `leading`       | `Snippet` (no args)                                                 | no       | —         | Pre-brand slot — host mounts a hamburger button (which opens SlideOverNav) when role-gating warrants. |
| `trailing`      | `Snippet` (no args)                                                 | no       | —         | Post-theme-toggle slot — host mounts search / notifications icons. |
| `right`         | `Snippet` (no args)                                                 | no       | —         | Account-widget mount on mobile. |

### Responsive split point

- `md:hidden` — mobile-only (inverse of ServiceBar).

### Visual / structural anchors

- Fixed: `fixed top-0 left-0 right-0 z-50 h-14`.
- Backdrop: `bg-[#0d1229]/85 backdrop-blur-xl border-b border-white/10`.
- Theme button: `h-10 w-10 rounded-full text-white/60 hover:bg-white/8 hover:text-white`.
- Inline sun/moon SVG glyphs — same self-contained pattern as ServiceBar.

### React port shape

```ts
interface MobileTopBarProps {
  theme?: ThemePreference;
  onToggleTheme?: () => void;
  brand?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  right?: React.ReactNode;
}
```

All four snippet slots are arg-less → `React.ReactNode`.

---

## 4. MobileBottomNav

File: `packages/ui-svelte/src/chrome/MobileBottomNav.svelte` (46 lines).
Purpose: mobile bottom tab strip — top-3-to-5 most-frequent destinations.

### Props

| Name          | Type          | Required | Default | Behaviour |
| ------------- | ------------- | -------- | ------- | --------- |
| `items`       | `NavItem[]`   | no       | `[]`    | Tab items (same `NavItem` shape as Sidebar: `{ href, label, icon }`). |
| `currentPath` | `string`      | no       | `''`    | Drives active styling. Same `isActive` predicate as Sidebar (`currentPath === href \|\| currentPath.startsWith(href + '/')`). |

### Responsive split point

- `md:hidden` — mobile-only.

### Visual / structural anchors

- Fixed: `fixed bottom-0 left-0 right-0 z-50`.
- Height honours iOS safe area: `h-[calc(4rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)]`.
- Backdrop: `bg-[#0d1229]/85 backdrop-blur-xl border-t border-white/10`.
- Active item: `text-primary-light bnav-active` (the `bnav-active` class is app-level CSS — same shared-stylesheet contract as Sidebar's `sidebar-link-active`).
- Tap target: `min-h-[44px]` (Apple's HIG minimum).
- Item layout: `flex-1 flex-col items-center justify-center gap-1` — icon over micro-label.

### React port shape

```ts
interface MobileBottomNavProps {
  items?: NavItem[];
  currentPath?: string;
}
```

The simplest of the seven — no slots, no callbacks, no theme.

---

## 5. SlideOverNav

File: `packages/ui-svelte/src/chrome/SlideOverNav.svelte` (80 lines).
Purpose: mobile-only left-anchored drawer that surfaces the full nav set when MobileBottomNav can only show the top few. Built on the Sheet primitive (bits-ui).

### Props

| Name          | Type                              | Required | Default | Behaviour |
| ------------- | --------------------------------- | -------- | ------- | --------- |
| `open`        | `boolean` (`$bindable`)           | no       | `false` | Two-way binding in Svelte: parent passes `bind:open={…}` and the drawer closes itself by writing back to it. **In React this becomes a controlled pair**: `open: boolean` + `onOpenChange: (next: boolean) => void`. |
| `items`       | `NavItem[]`                       | no       | `[]`    | Nav items, same shape as Sidebar. |
| `currentPath` | `string`                          | no       | `''`    | Drives `aria-current="page"` on the active link. Same `isActive` predicate. |
| `brand`       | `Snippet` (no args)               | no       | —       | Top-of-drawer brand slot. |
| `footer`      | `Snippet` (no args)               | no       | —       | Bottom-of-drawer slot — typically user identity, since AccountWidget owns sign-out and lives in MobileTopBar's right slot. |

### Quirks worth preserving

- Each `<a>` has `onclick={closeMenu}` so tapping any nav item dismisses the drawer (otherwise the user lands on the new route with the drawer still open). Replicate this in the React port.
- Backdrop / focus-trap / ESC dismissal / slide-in animation all come from the Sheet primitive — the SlideOverNav itself is composition, not mechanics.

### Responsive split point

- `md:hidden` applied to `SheetContent` — the drawer is mobile-only at the call site (the underlying Sheet primitive is breakpoint-agnostic).

### Visual / structural anchors

- Slide side: `side="left"`.
- Width: `w-72 sm:max-w-sm`.
- Padding zero, internal layout: `p-0 bg-card flex flex-col gap-0`.
- Nav scroll container: `flex-1 overflow-y-auto px-2 py-3 space-y-0.5`.
- Brand header: `flex h-14 items-center border-b border-border px-4 shrink-0`.
- Footer: `border-t border-border p-2 shrink-0`.
- Same item styling as Sidebar's expanded form, no `collapsed` variant.

### React port shape

```ts
interface SlideOverNavProps {
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  items?: NavItem[];
  currentPath?: string;
  brand?: React.ReactNode;
  footer?: React.ReactNode;
}
```

The `open` ↔ `onOpenChange` pair mirrors Radix `Dialog`'s controlled API. Internally the React component forwards `open` + `onOpenChange` to `<Sheet>`, identically to the Svelte version's `bind:open`.

---

## 6. Sheet primitive set

Directory: `packages/ui-svelte/src/primitives/sheet/` (10 files, all thin bits-ui re-exports).
Purpose: backdrop + portal + focus-trap + ESC dismissal + side-anchored slide animation for slide-over surfaces. Consumed by SlideOverNav today; would back any future dialog/sheet surface.

### Sub-primitives (exported as both bare names and `Sheet*`-prefixed aliases)

| Bare / Prefixed                                  | bits-ui backing                | Notes |
| ------------------------------------------------ | ------------------------------ | ----- |
| `Root` / `Sheet`                                 | `Dialog.Root`                  | Owns `open` (`$bindable`). |
| `Portal` / `SheetPortal`                         | `Dialog.Portal`                | No styling. |
| `Trigger` / `SheetTrigger`                       | `Dialog.Trigger`               | `data-slot="sheet-trigger"`. |
| `Close` / `SheetClose`                           | `Dialog.Close`                 | `data-slot="sheet-close"`. |
| `Overlay` / `SheetOverlay`                       | `Dialog.Overlay`               | Default classes: `bg-black/10 supports-backdrop-filter:backdrop-blur-xs fixed inset-0 z-50`. |
| `Content` / `SheetContent`                       | `Dialog.Content`               | The big one — see breakdown below. |
| `Header` / `SheetHeader`                         | plain `<div>`                  | `gap-0.5 p-4 flex flex-col`. |
| `Footer` / `SheetFooter`                         | plain `<div>`                  | `gap-2 p-4 mt-auto flex flex-col`. |
| `Title` / `SheetTitle`                           | `Dialog.Title`                 | `text-foreground text-base font-medium`. |
| `Description` / `SheetDescription`               | `Dialog.Description`           | `text-muted-foreground text-sm`. |

### SheetContent props (the only sub-primitive with non-trivial props)

| Prop              | Type                                            | Default     | Behaviour |
| ----------------- | ----------------------------------------------- | ----------- | --------- |
| `ref`             | `HTMLElement \| null` (`$bindable`)             | `null`      | Element ref for the content root. |
| `class`           | `string`                                        | —           | Merged with the side-keyed Tailwind utility set via `cn()`. |
| `side`            | `'top' \| 'right' \| 'bottom' \| 'left'`        | `'right'`   | Drives the `data-side={side}` attribute, which the Tailwind class set keys off for positioning (`data-[side=left]:left-0`, `data-[side=left]:w-3/4`, …) and animation (`data-[side=left]:data-open:slide-in-from-left-10`). |
| `showCloseButton` | `boolean`                                       | `true`      | When true, a built-in close button (Lucide `X` icon, top-right) renders inside the content. |
| `portalProps`     | `ComponentProps<typeof SheetPortal>` (no children) | —        | Forwarded to the inner `SheetPortal` wrapper. |
| `children`        | `Snippet`                                       | —           | Content body. **Required** in the Svelte type. |
| `...restProps`    | `Dialog.ContentProps` (without children/child)  | —           | Forwarded to `Dialog.Content` (covers `onInteractOutside`, `onEscapeKeyDown`, etc.). |

### Visual / structural anchors (the long Tailwind string on Content)

```
bg-popover text-popover-foreground fixed z-50 flex flex-col gap-4 bg-clip-padding text-sm shadow-lg transition duration-200 ease-in-out
data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t
data-[side=left]:inset-y-0   data-[side=left]:left-0     data-[side=left]:h-full   data-[side=left]:w-3/4 data-[side=left]:border-r
data-[side=right]:inset-y-0  data-[side=right]:right-0   data-[side=right]:h-full  data-[side=right]:w-3/4 data-[side=right]:border-l
data-[side=top]:inset-x-0    data-[side=top]:top-0       data-[side=top]:h-auto    data-[side=top]:border-b
data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm
data-open:animate-in   data-open:fade-in-0
data-[side=bottom]:data-open:slide-in-from-bottom-10
data-[side=left]:data-open:slide-in-from-left-10
data-[side=right]:data-open:slide-in-from-right-10
data-[side=top]:data-open:slide-in-from-top-10
data-closed:animate-out data-closed:fade-out-0
data-[side=bottom]:data-closed:slide-out-to-bottom-10
data-[side=left]:data-closed:slide-out-to-left-10
data-[side=right]:data-closed:slide-out-to-right-10
data-[side=top]:data-closed:slide-out-to-top-10
```

The Tailwind class string is identical in React — keep it verbatim. The only host-side requirement is Radix-React's matching `data-state="open"` / `data-state="closed"` attributes; the Tailwind utilities in the chrome use `data-open` and `data-closed` (bits-ui's flat shape). The React port may need to either map Radix's `data-state` → custom data attributes via a wrapper, or accept that Tailwind's `data-[state=open]:…` selectors are the React idiom and rewrite the class string to match. **Document this decision in T52** (Sheet primitive port).

### React port: backing library

- **Recommended:** `@radix-ui/react-dialog` — same `Root/Portal/Overlay/Content/Trigger/Close/Title/Description` shape. The Sheet wrapper layers the side-aware Tailwind classes on top.
- The bits-ui Svelte primitive uses `data-open` / `data-closed` attributes; Radix uses `data-state="open"` / `data-state="closed"`. The React port's Sheet must rewrite the class string from `data-open:slide-in-from-left-10` → `data-[state=open]:slide-in-from-left-10` (and the `data-closed` pairs likewise). The animation utilities (`slide-in-from-*`, `slide-out-to-*`, `animate-in`, `animate-out`) are `tailwindcss-animate` plugin classes — confirm the plugin is in fast's Tailwind config or carry it across.

---

## 7. AccountWidget

File: `packages/account-widget-svelte/src/AccountWidget.svelte` (190 lines).
Purpose: shared account surface — avatar button + popover with user identity, manage-account link, app switcher, sign-out. Mounted in the right-slot of ServiceBar (desktop) and MobileTopBar (mobile).

### Props

| Name                     | Type                  | Required | Default | Behaviour |
| ------------------------ | --------------------- | -------- | ------- | --------- |
| `currentApp`             | `string`              | **yes**  | —       | Slug of host app. Drives the "Here" badge in the app-switcher list. |
| `portalOrigin`           | `string`              | **yes**  | —       | Portal origin (e.g. `'https://coms.ahacommerce.net'`). Used for `/profile` link + sign-out. Trailing `/` is stripped internally. |
| `user`                   | `User`                | **yes**  | —       | `{ name: string; email: string; portalRole: string; apps: string[] }`. Host loads server-side; widget treats falsy as "render nothing" (the outer `{#if user}` short-circuits the entire output — preserve this in the React port: `if (!user) return null;`). |
| `appSwitcher`            | `AppSwitcherEntry[]`  | **yes**  | —       | App-switcher list: `{ slug, label, url }[]`. Host derives from `user.apps` + slug→URL map. |
| `postLogoutRedirectUri`  | `string`              | no       | —       | Where the portal redirects after RP-initiated OIDC logout. Falls back to `${window.location.origin}/` if omitted. Must be allowlisted in portal's `app_registry`. |
| `notificationsSlot`      | `Snippet` (no args)   | no       | —       | Reserved spec-01 §Visual Spec slot for a future notifications surface. |

### Internal state + behaviour

- `popoverOpen = $state(false)` — local open/close toggle. The trigger button toggles it; clicks on menu items / the backdrop button close it.
- `initials` — derived from `user.name`: first letter of up to first two words, uppercased.
- `trimmedPortalOrigin` — `portalOrigin` with trailing `/` stripped (idempotent).
- `profileHref` — `${trimmedPortalOrigin}/profile`.
- `handleSignOut` — closes popover, then calls `performSignOut({ portalOrigin: trimmed, postLogoutRedirectUri: opts ?? `${window.location.origin}/` })`. **`performSignOut` does `window.location.assign(...)` — the script context dies after this call.** The React port must mirror this behaviour exactly (top-level browser navigation, **not** `fetch`).
- `handleKeydown(e: KeyboardEvent)` — listens for `Escape` on the window via `<svelte:window onkeydown={…}>` and closes the popover. In React: `useEffect(() => { window.addEventListener('keydown', fn); return () => window.removeEventListener(...) }, [])`.

### Dev-only sanity check (`$effect`)

If `window.location.hostname` matches localhost / 127.0.0.1 / `*.local`, and `currentApp` isn't in `user.apps`, the widget logs a `console.warn`. Production stays silent. Preserve this dev affordance in the React port — it has caught real prop-derivation bugs.

### Visual / structural anchors

- Trigger button: `h-[26px] flex items-center gap-1.5 rounded-md px-2 hover:bg-white/6`.
- Initials disc: `h-5 w-5 rounded-full bg-primary-light/25 text-[8px] font-bold text-primary-light`.
- First-name label: `hidden sm:inline text-[11px] font-semibold text-primary-light/70` — desktop-and-wider only.
- Popover: `fixed top-9 right-3 z-[80] w-64 rounded-xl border border-border bg-card shadow-modal`.
- Backdrop button (catches outside-clicks): `fixed inset-0 z-[75]` — a hidden full-viewport button with `aria-label="Close menu"` and `tabindex="-1"`.
- App-switcher row, active app: `bg-accent text-foreground border-l-2 border-primary font-semibold` + a "Here" badge.

### Accessibility

- Trigger: `aria-label="Account menu"`, `aria-haspopup="menu"`, `aria-expanded={popoverOpen}`.
- Popover container: `role="menu"`.
- Menu items: `role="menuitem"`, `aria-current="page"` on the active app entry.

### React port shape

```ts
interface AccountWidgetProps {
  currentApp: string;
  portalOrigin: string;
  user: {
    name: string;
    email: string;
    portalRole: string;
    apps: string[];
  } | null;
  appSwitcher: { slug: string; label: string; url: string }[];
  postLogoutRedirectUri?: string;
  notificationsSlot?: React.ReactNode;
}
```

`user` is typed as nullable here even though the Svelte version's outer `{#if user}` makes the same observable contract — React's TypeScript surface benefits from being explicit. The component returns `null` when `user` is falsy.

---

## Helper modules

### `derive-services.ts` (44 lines)

```ts
export interface ServiceCatalogEntry { slug: string; label: string; url: string; }
export interface ServiceBarItem      { slug: string; label: string; href?: string; }

export function deriveServiceBarServices(input: {
  catalog: readonly ServiceCatalogEntry[];
  currentApp: string;
  currentOrigin?: string;
}): ServiceBarItem[];
```

Pure mapper from `(catalog, currentApp, currentOrigin?)` to ServiceBar `services` props:

- The current app's entry drops `href` (so ServiceBar renders it as the active non-link tab).
- Entries whose `url` starts with `currentOrigin` collapse to a path-relative `href` (the single-origin canonical shape — `aha-coms.web.app` prefix stripped). Otherwise `href` is the full URL.
- The synthetic portal-hub entry (`{ slug: 'portal', label: 'COMS', url: '/' }`) is **not added here** — `apps/portal-api/src/routes/userinfo.ts` prepends it to `appCatalog` before the catalog ever reaches the chrome derive helper. (Recorded in plan.md's Finding 5 — the lesson was "hub knowledge belongs in canonical sources, not duplicated in every app".)

**React port:** identical signature, framework-free TypeScript. Either republish from `@coms-portal/ui-react/chrome` or share the helper between Svelte and React by lifting it into a shared package (TBD in T51 — recommend keeping per-framework copies for now; the helper is 30 lines).

### `resolve-theme.ts` (25 lines)

```ts
export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme   = 'light' | 'dark';

export function resolveTheme(preference: ThemePreference): ResolvedTheme;
```

Today's rule: `'system'` → `'light'`. The toggle icon is rendered against this resolved value; the actual DOM `dark` class is resolved elsewhere (apps' `uiState.applyDomClass` step keyed off `prefers-color-scheme`). The helper exists so the chrome doesn't carry a media-query read into SSR — the chrome stays render-deterministic.

**React port:** identical TypeScript signature, framework-free. Republish from `@coms-portal/ui-react/chrome`.

### `sign-out.ts` (in account-widget-svelte, 47 lines)

```ts
export interface SignOutOptions {
  portalOrigin: string;
  postLogoutRedirectUri: string;
  idTokenHint?: string;
}

export function signOut(options: SignOutOptions): void;
```

- Trims trailing `/` from `portalOrigin`.
- Builds `URLSearchParams` with `post_logout_redirect_uri` (and `id_token_hint` if provided).
- Calls `window.location.assign(`${trimmedOrigin}/api/auth/logout?${params}`)`. **Never resolves** — the script context dies.
- Throws synchronously if `typeof window === 'undefined'` so SSR / test environments fail loudly.

**React port:** identical TypeScript signature, framework-free. Republish from `@coms-portal/account-widget-react`.

---

## Cross-cutting requirements for the React port

1. **Design tokens** — both Svelte and React consume CSS variables from `@coms-portal/design-tokens/css`. The React port must import the same token sheet at the app shell (fast's root layout) so `bg-card`, `text-foreground`, `border-border`, `bg-primary-light/25`, `from-deep-navy → to-primary-dark`, etc. resolve. No re-port of the tokens themselves.

2. **App-level CSS contracts** — three classes are referenced by the chrome but not defined by it:

   - `sidebar-link-active` (Sidebar + SlideOverNav active item).
   - `bnav-active` (MobileBottomNav active item).
   - `section-label` (Sidebar section heading typography).
   - `tap-active` (ServiceBar form-button + MobileBottomNav item — tap-feedback hook).

   Heroes + portal define these in their app-level stylesheets. **Document this contract** in the React port's README so fast's stylesheet picks them up at T75 (chrome mounting).

3. **Lucide icons** — Svelte chrome uses `@lucide/svelte ^1.14.0`; React port uses `lucide-react`. Icon prop types: `Component` (Svelte) → `LucideIcon` (React). The chrome components themselves don't pin specific icons — they receive icons via the `NavItem.icon` prop. (ServiceBar + MobileTopBar self-contain their sun/moon glyphs as inline SVG, no Lucide dependency for the bar itself.)

4. **Sheet primitive backing** — `bits-ui` Dialog → `@radix-ui/react-dialog`. Data attribute names differ (`data-open/data-closed` vs `data-state="open"|"closed"`); the React Sheet wrapper either rewrites the Tailwind class set or layers a compat wrapper. Tailwind animation utilities (`tailwindcss-animate` plugin) must be in fast's Tailwind config.

5. **Snippet → ReactNode / render-prop mapping** — summary:

   - Arg-less snippets (`brand`, `leading`, `trailing`, `right`, `notificationsSlot`, `footer` on SlideOverNav) → `React.ReactNode`.
   - Argument-passing snippets (`logo`, `footer` on Sidebar, both `{ collapsed }`) → `(args: { collapsed: boolean }) => React.ReactNode` render-props.

6. **`$bindable` → controlled pair** — SlideOverNav's `open` is the only `$bindable` in the chrome surface. The React port exposes it as `open` + `onOpenChange`.

7. **Top-level browser navigation in sign-out** — preserve `window.location.assign(…)` semantics. Do **not** convert to `fetch` + manual redirect — the portal's RP-initiated logout response is a 303 that the browser must follow on the top-level navigation.

8. **Server-Component compatibility** — fast renders on the Next.js App Router. The chrome components themselves are interactive (state, event handlers, effects) and must be marked `'use client'` at the top. The derivation helpers (`deriveServiceBarServices`, `resolveTheme`) stay pure and can be called from either Server or Client Components.

## Out of scope for T50

- Tailwind config / token theming review — assumed identical between Svelte and React consumers (heroes + portal vs fast).
- Internationalization — chrome strings ("Sign out", "Manage account", "Apps", "Here", "Account menu", "Mobile navigation", "Main navigation", "Switch to light mode" / "Switch to dark mode", "Close menu", "Application navigation") are hard-coded English today; the React port mirrors the Svelte shape exactly. i18n is contract-orthogonal and lifts later if/when it becomes a suite-wide requirement.
- Tests — T53 (stub consumer) is the first verification surface. Unit tests for the chrome components are deferred until T54 (visual parity) surfaces regression risk.
