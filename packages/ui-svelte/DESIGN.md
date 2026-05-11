---
version: 1.0
name: COMS Design System
description: >
  Unified visual language for COMS, the AHA Commerce superapp platform.
  Each service (Heroes, etc.) runs as an independent web app
  but shares this design system, shell chrome, and component patterns.
canonical: true
source-of-truth: coms_portal/docs/design-system/DESIGN.md
packages:
  tokens: "@coms-portal/design-tokens"
  ui: "@coms-portal/ui-svelte"
  account-widget: "@coms-portal/account-widget"

colors:
  # Brand palette (immutable across themes)
  primary-dark: "#1D388B"
  primary: "#325FEC"
  primary-light: "#96ADF5"
  deep-navy: "#0F0E7F"
  gold: "#F4C144"
  gold-light: "#FFD97D"
  purple: "#6D50B8"
  sky-blue: "#759EEE"
  penalti: "#C73E3E"
  white: "#FFFFFF"

  # Semantic — light mode
  background: "#F2F3F8"
  foreground: "#1A1B2E"
  card: "#FFFFFF"
  card-foreground: "#1A1B2E"
  primary-foreground: "#FFFFFF"
  secondary: "#EBEDF5"
  secondary-foreground: "#2E3566"
  muted: "#F0F1F5"
  muted-foreground: "#6B7094"
  accent: "#EBEDF5"
  accent-foreground: "#2E3566"
  destructive: "#EF4444"
  border: "#E0E2EC"
  input: "#E0E2EC"
  ring: "#325FEC"

  # Semantic — dark mode (applied via class="dark" on <html>)
  dark-background: "#1C1E30"
  dark-foreground: "#F5F5FA"
  dark-card: "#272A40"
  dark-card-foreground: "#F5F5FA"
  dark-primary: "#6495FF"
  dark-primary-foreground: "#1E2240"
  dark-secondary: "#2E3250"
  dark-secondary-foreground: "#D8DAE5"
  dark-muted: "#333755"
  dark-muted-foreground: "#8890B0"
  dark-accent: "#2E3250"
  dark-accent-foreground: "#D8DAE5"
  dark-border: "#3C4060"
  dark-input: "#3C4060"
  dark-ring: "#6495FF"

  # Status colors
  status-approved: "#16a34a"
  status-approved-bg: "#22C55E26"
  status-pending: "#a07700"
  status-pending-bg: "#F4C14426"
  status-challenged: "#6D50B8"
  status-challenged-bg: "#6D50B826"
  status-rejected: "#dc2626"
  status-rejected-bg: "#EF44441A"

typography:
  hero-heading:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: 800
    letterSpacing: -0.02em
  page-title:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: 800
  section-label:
    fontFamily: Manrope
    fontSize: 11px
    fontWeight: 700
    letterSpacing: 0.05em
  card-title:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: 700
  body-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: 500
  body-semibold:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: 600
  caption:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: 500
  caption-sm:
    fontFamily: Manrope
    fontSize: 11px
    fontWeight: 500
  badge-text:
    fontFamily: Manrope
    fontSize: 10px
    fontWeight: 700
    letterSpacing: 0.02em
  nav-item:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: 500
  nav-item-active:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: 700
  service-bar-text:
    fontFamily: Manrope
    fontSize: 11px
    fontWeight: 600
    letterSpacing: 0.02em
  service-bar-active:
    fontFamily: Manrope
    fontSize: 11px
    fontWeight: 700
    letterSpacing: 0.02em
  stat-value:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: 800
    letterSpacing: -0.02em

rounded:
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  button: 12px
  card: 16px
  badge: 99px
  avatar: 9999px
  service-tab: 6px
  input: 12px

spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  2xl: 24px
  3xl: 32px
  4xl: 40px
  5xl: 48px
  6xl: 64px
  page-padding-desktop: 24px
  page-padding-mobile: 16px
  page-bottom-desktop: 32px
  page-bottom-mobile: 96px
  grid-gap-desktop: 16px
  grid-gap-mobile: 12px
  card-padding: 16px
  card-padding-hero: 20px
  service-bar-height: 36px
  header-height: 56px
  sidebar-collapsed: 64px
  sidebar-expanded: 256px
  mobile-nav-height: 64px
  touch-target-min: 44px
  page-max-width: 1024px
  content-max-width: 640px

components:
  service-bar:
    backgroundColor: "linear-gradient(90deg, #0F0E7F, #1D388B)"
    height: 36px
    textColor: "{colors.primary-light}"
  service-bar-tab:
    backgroundColor: transparent
    textColor: "rgba(150, 173, 245, 0.6)"
    rounded: "{rounded.service-tab}"
    padding: "0 12px"
    height: 26px
  service-bar-tab-active:
    backgroundColor: "rgba(244, 193, 68, 0.15)"
    textColor: "{colors.gold}"
  sidebar:
    backgroundColor: "{colors.card}"
    width: "{spacing.sidebar-collapsed}"
  sidebar-expanded:
    width: "{spacing.sidebar-expanded}"
  sidebar-nav-item:
    backgroundColor: transparent
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  sidebar-nav-item-active:
    backgroundColor: "linear-gradient(90deg, rgba(50,95,236,0.12), rgba(50,95,236,0.04))"
    textColor: "{colors.primary}"
  mobile-topbar:
    backgroundColor: "linear-gradient(135deg, rgba(15,14,127,0.92), rgba(29,56,139,0.90))"
    height: "{spacing.header-height}"
  mobile-bottomnav:
    backgroundColor: "rgba(13, 18, 41, 0.85)"
    height: "{spacing.mobile-nav-height}"
  button-gold:
    backgroundColor: "linear-gradient(135deg, #F4C144, #FFD97D)"
    textColor: "#7a5800"
    rounded: "{rounded.button}"
    padding: "10px 16px"
    height: "{spacing.touch-target-min}"
  button-gold-hover:
    backgroundColor: "linear-gradient(135deg, #e0ae38, #F4C144)"
  button-blue:
    backgroundColor: "linear-gradient(135deg, #325FEC, #759EEE)"
    textColor: "{colors.white}"
    rounded: "{rounded.button}"
    padding: "10px 16px"
    height: "{spacing.touch-target-min}"
  button-blue-hover:
    backgroundColor: "linear-gradient(135deg, #2850d0, #6590e0)"
  button-red:
    backgroundColor: "linear-gradient(135deg, #C73E3E, #E06B6B)"
    textColor: "{colors.white}"
    rounded: "{rounded.button}"
    padding: "10px 16px"
    height: "{spacing.touch-target-min}"
  button-purple:
    backgroundColor: "linear-gradient(135deg, #6D50B8, #9B7FE8)"
    textColor: "{colors.white}"
    rounded: "{rounded.button}"
    padding: "10px 16px"
    height: "{spacing.touch-target-min}"
  summary-card-gold:
    backgroundColor: "linear-gradient(135deg, #F4C144, #F9D46A, #FFD97D)"
    textColor: "#7a5800"
    rounded: "{rounded.card}"
    padding: "{spacing.lg}"
  summary-card-blue:
    backgroundColor: "linear-gradient(135deg, #325FEC, #4B77F0, #759EEE)"
    textColor: "{colors.white}"
    rounded: "{rounded.card}"
    padding: "{spacing.lg}"
  summary-card-red:
    backgroundColor: "linear-gradient(135deg, #C73E3E, #D45555, #E06B6B)"
    textColor: "{colors.white}"
    rounded: "{rounded.card}"
    padding: "{spacing.lg}"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    padding: "{spacing.lg}"
  status-badge:
    rounded: "{rounded.badge}"
    padding: "2px 6px"
  avatar-sm:
    size: 20px
    rounded: "{rounded.avatar}"
    backgroundColor: "rgba(150, 173, 245, 0.25)"
  avatar-md:
    size: 32px
    rounded: "{rounded.avatar}"
    backgroundColor: "rgba(50, 95, 236, 0.1)"
  avatar-lg:
    size: 40px
    rounded: "{rounded.avatar}"
    backgroundColor: "rgba(50, 95, 236, 0.1)"
  avatar-xl:
    size: 80px
    rounded: "{rounded.avatar}"
    backgroundColor: "rgba(50, 95, 236, 0.1)"
  hero-greeting:
    backgroundColor: "linear-gradient(135deg, #1D388B, #2550C8, #325FEC)"
    rounded: "{rounded.card}"
    padding: "{spacing.card-padding-hero}"
  mobile-fab:
    backgroundColor: "linear-gradient(135deg, #325FEC, #759EEE)"
    textColor: "{colors.white}"
    size: 56px
    rounded: "{rounded.avatar}"
  notification-panel:
    backgroundColor: "{colors.card}"
    width: 380px
---

# COMS Design System

> **Version 1.0** · April 2026 · AHA Commerce
> **Canonical location:** `coms_portal/docs/design-system/DESIGN.md`. Heroes and other H-apps' copies are redirects to this file. Edits land here first.
> **For integration steps**, see [`ONBOARDING.md`](./ONBOARDING.md).
> **For version history**, see [`CHANGELOG.md`](./CHANGELOG.md).

---

## Overview

COMS is a **superapp platform** for AHA Commerce. Each service — Heroes, etc. — runs as an independent web app but shares a single, unified visual language and shell chrome.

The design philosophy is **"Consistent shell, flexible content."** Every app wears the same service bar, sidebar, and mobile navigation. Page content is yours to design, but the visual language — colors, type, spacing, components — must follow this system.

The aesthetic is **professional but warm**. Think "helpful colleague," not corporate memo and not casual chat. The brand reads as clean, modern, and trustworthy — navy blues, gold accents for gamification, generous whitespace, and smooth motion. It should feel like an internal tool built by people who care about craft.

Key principles:
- **Mobile-first, always.** Design for 375px first, then scale up. No exceptions.
- **Dark mode required.** Every surface must work in both themes using the provided tokens.
- **Manrope everywhere.** One font family, many weights. No mixing fonts.
- **Brand through color, not decoration.** Use the palette purposefully. No gratuitous gradients, shadows, or illustrations.

### How this system ships

This document is the **reference**. The system itself ships as three packages:

- **`@coms-portal/design-tokens`** — CSS custom properties, Tailwind preset, TypeScript exports. The values listed in this document's frontmatter are the source of truth; the package distributes them in machine-consumable formats.
- **`@coms-portal/ui-svelte`** — Svelte 5 components. Primitives (Button, Card, StatusBadge, Avatar, Tabs), chrome shells (ServiceBar, Sidebar, MobileTopBar, MobileBottomNav), and generic compositions (HeroGreeting, SummaryCard, NotificationPanel).
- **`@coms-portal/account-widget`** — the avatar/account/sign-out popover that mounts in every app's chrome (see Rev 3 Spec 01).

App teams **install and import**. They never re-implement components from this spec. To match the system, you consume the packages — this document explains *what* exists and *how* to compose it, not how to build it from scratch.

### Font loading

Load Manrope weights 200–800. Either delivery method is acceptable:

**Self-hosted (preferred):**

```ts
import '@fontsource/manrope/200.css'
import '@fontsource/manrope/300.css'
import '@fontsource/manrope/400.css'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/600.css'
import '@fontsource/manrope/700.css'
import '@fontsource/manrope/800.css'
```

**Google Fonts CDN (fallback):**

```html
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@200;300;400;500;600;700;800&display=swap" rel="stylesheet">
```

### Dark mode toggle

Dark mode is activated by adding `class="dark"` to the `<html>` element. Store the user's preference in `localStorage`. All components **must** reference `var(--token)` — never hardcode color values.

---

## Colors

The palette is built on a deep navy–electric blue axis with gold as the signature accent for gamification and rewards. Each color has a defined role — never use a color outside its semantic purpose.

### Brand colors (immutable across themes)

- **Primary Dark (#1D388B):** Service bar gradient end, hero backgrounds, deep navy surfaces. The institutional anchor of the brand.
- **Primary (#325FEC):** The workhorse blue. Primary actions, links, active states, focus rings. This is the "do something" color.
- **Primary Light (#96ADF5):** Service bar text (inactive), secondary accents. Never used for primary actions.
- **Deep Navy (#0F0E7F):** Service bar gradient start (darkest). Used only in chrome gradients.
- **Gold (#F4C144):** Active service tab highlight, Bintang (star) category, rewards, streaks, gamification accents. Gold means "achievement."
- **Gold Light (#FFD97D):** Gradient endpoint for gold buttons and badges. Never used alone.
- **Purple (#6D50B8):** "Challenged" status, special badges, challenge-related actions. The dissent color.
- **Sky Blue (#759EEE):** Gradient endpoints, chart accents, secondary decorative use.
- **Penalti Red (#C73E3E):** Penalty/destructive actions, the "Penalti" point category. Distinct from `destructive` (#EF4444) which is for error states.
- **White (#FFFFFF):** Card backgrounds in light mode.

### Semantic colors

Token values are defined in this document's frontmatter and shipped as CSS custom properties via `@coms-portal/design-tokens`. The frontmatter is the single source of truth — if a value disagrees with prose, the frontmatter wins.

Light-mode tokens: `--background`, `--foreground`, `--card`, `--muted`, `--muted-foreground`, `--border`, `--destructive`, `--ring` (see frontmatter `colors:` block).

Dark-mode tokens: same names, applied when `<html class="dark">`. Values in frontmatter `colors:` block prefixed with `dark-`.

### Status colors

Status badges use a tinted background at 10–15% opacity with a matching text color. These are fixed across themes.

| Status | Text Color | Background | Usage |
|---|---|---|---|
| Approved / Active | `#16a34a` | `rgba(34, 197, 94, 0.15)` | Approved points, active items |
| Pending | `#a07700` | `rgba(244, 193, 68, 0.15)` | Awaiting review |
| Challenged | `#6D50B8` | `rgba(109, 80, 184, 0.15)` | Disputed items |
| Rejected | `#dc2626` | `rgba(239, 68, 68, 0.1)` | Denied items |

### Gradients

Gradients are a core part of the visual identity. They are not decorative — each has a specific application.

| Name | Value | Usage |
|---|---|---|
| Hero | `linear-gradient(135deg, #1D388B, #2550C8, #325FEC)` | Page hero banners, greeting cards |
| Service Bar | `linear-gradient(90deg, #0F0E7F, #1D388B)` | Service bar background (mandatory) |
| Gold | `linear-gradient(135deg, #F4C144, #FFD97D)` | Bintang action buttons, gold summary cards |
| Blue | `linear-gradient(135deg, #325FEC, #759EEE)` | Primary action buttons, blue summary cards |
| Red | `linear-gradient(135deg, #C73E3E, #E06B6B)` | Penalti action buttons, red summary cards |
| Purple | `linear-gradient(135deg, #6D50B8, #9B7FE8)` | Challenge action buttons |

### Page background

Never use a flat solid-color page background. Always use the radial gradient mesh:

```css
.coms-page-bg {
  background-color: #EDF1FA;
  background-image:
    radial-gradient(ellipse 80% 50% at 10% 0%, rgba(50, 95, 236, 0.18) 0%, transparent 60%),
    radial-gradient(ellipse 60% 40% at 90% 100%, rgba(109, 80, 184, 0.15) 0%, transparent 55%),
    radial-gradient(ellipse 50% 30% at 50% 50%, rgba(29, 56, 139, 0.08) 0%, transparent 70%);
}
```

Dark mode page background uses reduced-opacity blue/purple radials on the dark `--background` token.

---

## Typography

**Manrope** is the only typeface. Load weights 200 through 800. No secondary font. The personality comes from weight contrast and letter-spacing, not font mixing.

| Role | Size | Weight | Letter-spacing | Usage |
|---|---|---|---|---|
| Hero heading | 20–24px | 800 | -0.02em | Page hero banners, large stat values |
| Page title | 20px | 800 | — | Page headers (e.g., "Points", "Leaderboard") |
| Section label | 11–13px | 700 | 0.05–0.08em, UPPERCASE | Category headers ("RECENT ACTIVITY", "ADMIN") |
| Card title | 14px | 700 | — | Card headers, person names |
| Body | 14px | 500–600 | — | General text, descriptions |
| Caption | 11–12px | 500–600 | — | Timestamps, secondary descriptions |
| Badge text | 9–11px | 700 | 0.02–0.08em | Status badges, role pills |
| Nav item (inactive) | 14px | 500 | — | Sidebar navigation links |
| Nav item (active) | 14px | 700 | — | Active sidebar link |
| Service bar tab | 11px | 600–700 | 0.02em | App switcher tabs |
| Stat counter | 24–30px | 800–900 | -0.02em | Dashboard stat values, balance displays |

### Fluid typography (mobile)

Use `clamp()` for hero and stat values so they scale smoothly:

```css
.text-fluid-hero { font-size: clamp(1.25rem, 4vw, 2rem); font-weight: 800; }
.text-fluid-stat { font-size: clamp(1.5rem, 5vw, 2.5rem); font-weight: 900; }
```

### Casing rules

| Context | Case | Example |
|---|---|---|
| Navigation items | Title Case | "Audit Log", "Sheet Sync" |
| Section labels | UPPERCASE + letter-spacing | "RECENT ACTIVITY", "ADMIN" |
| Buttons | Title Case | "Poin AHA", "View All" |
| Status badges | lowercase | "pending", "approved" |
| Body text / descriptions | Sentence case | "Review and approve points" |

### Tone and voice

- **Professional but warm.** Not corporate, not casual. Think "helpful colleague."
- **Action-oriented.** Labels are verbs or short noun phrases: "View all", "Submit", "Approve."
- **Concise.** No filler. Section headers are 1–3 words. Descriptions are one sentence max.

### Number formatting

- Point values: use `toLocaleString()` — display "1,850" not "1850"
- Relative time: "5m ago", "2h ago", "3d ago"
- Absolute dates: Indonesian format — "22 Apr 2026"

---

## Layout

The layout follows a **Fixed-Max-Width** model. Content is centered at `max-width: 1024px` for dashboards and `560–640px` for single-column pages (points, leaderboard, profile).

### Spacing scale

Built on a 4px base unit. Use these tokens, never arbitrary pixel values.

| Token | Value |
|---|---|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 20px |
| `--space-6` | 24px |
| `--space-8` | 32px |
| `--space-10` | 40px |
| `--space-12` | 48px |
| `--space-16` | 64px |

### Page chrome dimensions

| Element | Size |
|---|---|
| Service bar | 36px height, fixed top, full-width, z-index 70 |
| Desktop header | 56px height |
| Sidebar (collapsed) | 64px width |
| Sidebar (expanded) | 256px width |
| Mobile top bar | 56px height, fixed below service bar, z-index 50 |
| Mobile bottom nav | 64px height, fixed bottom, z-index 50 |
| Minimum touch target | 44px |

### Content padding

| Context | Padding |
|---|---|
| Desktop page | 24px horizontal |
| Mobile page | 16px horizontal |
| Desktop bottom | 32px |
| Mobile bottom | 96px (clearance for bottom nav) |
| Card padding | 16px standard, 20px for hero elements |
| Grid gap (desktop) | 16px |
| Grid gap (mobile) | 12px |

### Responsive breakpoints

| Breakpoint | Width | Behavior |
|---|---|---|
| Mobile | < 768px | Single column, bottom nav, mobile top bar, no sidebar |
| Desktop | >= 768px | Sidebar + header, multi-column grids, no bottom nav |

There is no tablet-specific breakpoint. The mobile layout stretches to 768px.

### Shared chrome architecture (mandatory for all COMS apps)

Every COMS app **must** include these four chrome elements. They are not optional. All four ship as components in `@coms-portal/ui-svelte` — apps consume them and pass app-specific data via props.

**1. Service Bar (36px, fixed top)** — `<ServiceBar>` from `@coms-portal/ui-svelte/chrome`
- Full-width navy gradient background
- Horizontal list of all COMS services (passed in via `services` prop)
- Active service determined by `currentApp` prop (matches the slug used by `@coms-portal/account-widget`)
- Right side: account widget slot (mount `<AccountWidget>` from `@coms-portal/account-widget` here)
- This is the COMS identity — it persists across every app

> **Service bar app list vs. AccountWidget popover app list — both are intentional.**
> The service bar shows apps inline as horizontal tabs (instant switching, short list). The AccountWidget popover renders the same apps vertically with richer metadata (last-accessed, role, notification badges). Microsoft 365 (suite header + waffle), Google (gbar), and AWS (Services menu + Recently Visited) all do both. Source of truth is the same `user.apps` data; the two surfaces are different presentations of it. Do not "deduplicate" by removing one.
> Rule: ≤ 6 apps → both surfaces show the full list inline; > 6 apps → service bar shows top 5 daily-drivers + "More ▾" overflow, popover shows all. See Rev 3 Spec 01 §Service-bar list vs. popover app list.

**2. Sidebar (desktop only)** — `<Sidebar>` from `@coms-portal/ui-svelte/chrome`
- Fixed left, below service bar, 64px collapsed / 256px expanded
- Expands on mouse enter, collapses on mouse leave. Transition: 200ms
- Top: app logo + app name (passed in via `appLogo` and `appName` props)
- Main nav + admin nav sections (passed in via `navItems` and `adminItems` props — each app provides its own list)
- Active link: blue gradient background + bold text
- User footer at bottom: avatar + name + role badge

**3. Mobile Top Bar (56px, fixed below service bar)** — `<MobileTopBar>` from `@coms-portal/ui-svelte/chrome`
- Navy translucent background with backdrop-filter blur
- Left: app logo + app name (props)
- Right: account widget slot

**4. Mobile Bottom Nav (64px, fixed bottom)** — `<MobileBottomNav>` from `@coms-portal/ui-svelte/chrome`
- 5-item nav, each app passes its own list via `items` prop
- Icons + labels. Active: gold text + blue gradient top indicator bar
- Inactive: muted white

**Per-app responsibility:** provide `navItems`, `adminItems`, `appName`, `appLogo`, `currentApp`, and the `services` list. The chrome shells handle all visual styling.

---

## Elevation & Depth

Elevation is conveyed through **layered shadows with blue-tinted rgba values**, not flat borders. The shadow system uses the deep-navy hue for a cohesive feel, not generic black.

| Token | Value | Usage |
|---|---|---|
| `--shadow-card` | `0 2px 12px rgba(15,14,127,0.10), 0 1px 3px rgba(0,0,0,0.06)` | Default card resting state |
| `--shadow-card-hover` | `0 8px 28px rgba(15,14,127,0.16), 0 2px 8px rgba(0,0,0,0.08)` | Card on hover |
| `--shadow-modal` | `0 8px 32px rgba(15,14,127,0.18), 0 2px 8px rgba(0,0,0,0.10)` | Modals, slide-over panels |
| `--shadow-glow-gold` | `0 0 20px rgba(244,193,68,0.35), 0 4px 12px rgba(244,193,68,0.20)` | Gold action button hover |
| `--shadow-glow-blue` | `0 0 20px rgba(50,95,236,0.30), 0 4px 12px rgba(50,95,236,0.18)` | Blue action button hover |

Dark mode shadows switch to darker rgba values:
- Card: `0 2px 12px rgba(0,0,0,0.25), 0 1px 3px rgba(0,0,0,0.15)`
- Card hover: `0 8px 28px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)`
- Modal: `0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.25)`

Gradient summary cards use a colored glow shadow matching their variant, not the standard card shadow.

---

## Shapes

The shape language balances **soft rounded cards** with **pill-shaped badges** and **circular avatars**. Each element type has a fixed radius — do not mix.

| Element | Radius | Token |
|---|---|---|
| Cards, panels, hero banners | 16px | `--radius-card` |
| Buttons, inputs | 12px | `--radius-button` |
| Icon containers | 8–12px | `--radius-md` / `--radius-lg` |
| Service bar tabs | 6px | `--radius-service-tab` |
| Badges, pills, status chips | 99px | `--radius-badge` |
| Avatars | 50% (always circular) | `--radius-avatar` |
| Progress bars | 99px | `--radius-badge` |

### Border treatment

- Default: `1px solid var(--border)`
- Gold accent borders: `1px solid rgba(244, 193, 68, 0.15–0.25)` — used on leaderboard cards and gamification elements
- Active state borders: border color matches the category color at 20–30% opacity
- Never use colored left-border-only cards (this is not part of the COMS visual language)

---

## Components

All components below ship as Svelte 5 components in `@coms-portal/ui-svelte`. App teams import and use them — they never reimplement from this spec.

### Summary Cards (gradient) — `<SummaryCard variant="gold|blue|red" />`

Three variants. Used on dashboards for key metrics.

- Full gradient background with a white overlay highlight
- Top: 40x40px icon container with translucent white background
- Title: 11px, weight 600, uppercase, 0.05em letter-spacing
- Value: 24px, weight 800, -0.02em letter-spacing. Use `toLocaleString()` for number formatting
- Hover: `translateY(-2px)` + elevated shadow. Transition: 200ms
- Gold variant: text is `#7a5800`. Blue/Red variants: white text

### Action Buttons (gradient) — `<Button variant="gold|blue|red|purple" />`

All action buttons use gradient backgrounds with a shine-on-hover sweep effect. Minimum height: 44px.

- Hover: `translateY(-1px)` + glow shadow matching the button color
- Active/Press: `scale(0.97)` for 100ms
- Shine effect: a `linear-gradient` sweep from left to right on hover, 600ms

### Hero Greeting Card — `<HeroGreeting>`

- Hero gradient background
- Decorative blur circles (gold top-right, blue bottom-left)
- "Welcome back," subtitle + user name + role pill

### List Items / Point Cards

App-domain composition — built per-app from `<Card>`, `<Avatar>`, `<StatusBadge>` primitives. Heroes' point card is documented in Heroes' app docs; each future app builds its own domain compositions the same way.

### Status Badges — `<StatusBadge status="approved|pending|challenged|rejected" />`

- Pill shape: 99px radius
- Background: status color at 10–15% opacity
- Text: matching solid status color
- Font: 10px, weight 600, capitalize

### Leaderboard

App-domain composition. Lives in Heroes; not in `@coms-portal/ui-svelte`. Other apps build their own analogues from primitives.

### Avatars — `<Avatar size="sm|md|lg|xl" />`

Always circular. Background: `rgba(50, 95, 236, 0.1)` with bold initial letters in primary blue.

| Context | Size |
|---|---|
| Service bar | 20px (sm) |
| Sidebar / header | 32px (md) |
| Lists | 36px (md) |
| Cards | 40px (lg) |
| Profile page | 80px (xl) |

### Notification Panel — `<NotificationPanel>`

- Slide-over from right, 380px width, full height below service bar
- Entry animation: `slide-in-right 0.2s cubic-bezier(0.22, 1, 0.36, 1)`
- Backdrop: `rgba(0,0,0,0.2)` with `backdrop-filter: blur(2px)`
- Grouped into "New" (unread) and "Earlier" (read) sections

### Mobile FAB — `<MobileFab>`

- 56px circular button, blue gradient background, white "+" icon
- Open state: rotates 45° to "x"
- Expanding actions: pill-shaped items with gradient backgrounds, staggered entry animation

### Tabs — `<Tabs>`

- Container: card background, 1px border, 6px padding, 16px radius
- Tab buttons: flex-1, 12px radius, 8px vertical padding, 36px min-height
- Active tab: category-tinted background + matching text color

---

## Do's and Don'ts

### Do

- Do consume `@coms-portal/design-tokens` and `@coms-portal/ui-svelte` — never re-implement components from this spec
- Do use CSS custom properties (`var(--token)`) for all colors — never hardcode hex values
- Do include both light and dark theme support for every surface
- Do use the radial gradient mesh for page backgrounds — never flat solid colors
- Do use `toLocaleString()` for all point values and numbers
- Do use Lucide Icons exclusively — never hand-draw SVGs or use emoji as icons in UI chrome
- Do respect `prefers-reduced-motion: reduce` — disable all animations
- Do maintain 44px minimum touch targets for all interactive elements
- Do mount the four chrome shells (service bar, sidebar, mobile top bar, mobile bottom nav) on every page — they are mandatory
- Do pair colors with icons or text — color alone must not convey meaning (accessibility)
- Do format dates in Indonesian locale ("22 Apr 2026") and use relative time for recent items

### Don't

- Don't reimplement components from this spec — open a PR on `@coms-portal/ui-svelte` if you need a variant
- Don't use emoji in UI chrome, labels, or navigation — acceptable only sparingly in gamification contexts (streak badges)
- Don't use any font other than Manrope
- Don't use colored left-border-only cards — this is not part of the COMS visual language
- Don't use stock photos or AI-generated illustrations as placeholders — use tinted icon backgrounds instead
- Don't add flat solid shadows — always use the blue-tinted `rgba(15,14,127,...)` shadow tokens
- Don't mix border-radius values — cards are always 16px, buttons 12px, badges 99px, avatars circular
- Don't skip the service bar or sidebar on any page — they are the COMS identity
- Don't use more than the defined gradient set — no custom gradients
- Don't use arbitrary spacing values — stick to the 4px-based spacing scale

---

## Iconography

**Lucide Icons** is the only icon set. Stroke-based, 2px stroke width, `currentColor` for fill.

- Default size: 18px for UI elements
- Compact contexts: 14–16px
- Feature/hero icons: 20px+
- Never use emoji as icons in chrome or navigation
- Never hand-draw SVG icons — always use the Lucide set

### Icon mapping

| Function | Lucide Icon |
|---|---|
| Dashboard | `LayoutDashboard` |
| Points / Award | `Award` |
| Leaderboard | `Trophy` |
| Rewards | `Gift` |
| Redemptions | `ShoppingCart` |
| Users | `Users` |
| Teams | `Building2` |
| Reports | `BarChart3` |
| Settings | `Settings` |
| Notifications | `Bell` |
| Search | `Search` |
| Star / Bintang | `Star` |
| Penalty | `AlertTriangle` |
| Profile | `User` |
| Dark mode | `Moon` (dark) / `Sun` (light) |
| Close | `X` |
| Add | `Plus` |
| Navigate right | `ChevronRight` |
| Crown (rank 1) | `Crown` |

---

## Animation & Motion

All motion uses `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-expo) for enters. This creates a snappy, professional feel — fast start, gentle settle.

| Animation | Easing | Duration | Transform | Usage |
|---|---|---|---|---|
| Page enter (fade-in) | ease-out-expo | 250ms | `opacity 0→1, translateY(6px→0)` | Page content appearing |
| Stagger items | ease-out-expo | 300ms, 40ms delay | `opacity 0→1, translateX(-8px→0)` | List items, notifications |
| Stat counter | ease-out-expo | 450ms | `opacity 0→1, translateY(10px→0), scale(0.96→1)` | Number reveals |
| Card hover lift | ease | 200ms | `translateY(-2px)` + shadow elevation | Interactive cards |
| Button hover | ease | 220ms | `translateY(-1px)` + glow shadow | Action buttons |
| Shine sweep | ease | 600ms | Gradient sweep left-to-right | Primary action buttons |
| Button press | ease | 100ms | `scale(0.97)` | Active/tap state |
| Sidebar expand | linear | 200ms | Width 64px → 256px | Desktop sidebar |
| Panel slide | ease-out-expo | 200ms | `translateX(100%→0)` | Notification panel |
| FAB rotate | ease | 200ms | `rotate(0→45deg)` | FAB open/close |

**Reduced motion:** All animations must be disabled under `prefers-reduced-motion: reduce`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Quick palette reference

```
Primary:       #325FEC (blue)      Dark mode: #6495FF
Primary Dark:  #1D388B (navy)
Gold:          #F4C144 (amber)     Gold Light: #FFD97D
Penalti:       #C73E3E (red)
Purple:        #6D50B8
Background:    #F2F3F8 (light)     #1C1E30 (dark)
Card:          #FFFFFF (light)     #272A40 (dark)
Text:          #1A1B2E (light)     #F5F5FA (dark)
Muted text:    #6B7094 (light)     #8890B0 (dark)
Border:        #E0E2EC (light)     #3C4060 (dark)
Font:          Manrope 200-800
Icons:         Lucide Icons only
```
