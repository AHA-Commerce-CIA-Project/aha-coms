# COMS Design System — Contribution Guide

> Audience: any team consuming the COMS design system (portal, Heroes, future H-apps) and any contributor proposing a change to it.
>
> **What this answers:** "I see something in the UI I'd like to change. Where do I make that change so it stays consistent across every app in the suite?"

---

## TL;DR

| You want to change | Edit in this repo | Distribution mechanism |
|---|---|---|
| **Color, font, spacing, radius, shadow, brand asset** | [`mrdoorba/coms-design-tokens`](https://github.com/mrdoorba/coms-design-tokens) | Tag bump → consumer pin update |
| **Primitive component** (Button, Card, Dialog, Input, Select, Table, etc.) | [`mrdoorba/coms-ui`](https://github.com/mrdoorba/coms-ui) `src/primitives/` | Tag bump → consumer pin update |
| **Chrome shell** (ServiceBar, Sidebar, MobileTopBar, MobileBottomNav) | [`mrdoorba/coms-ui`](https://github.com/mrdoorba/coms-ui) `src/chrome/` | Tag bump → consumer pin update |
| **Account widget** (avatar popover, sign-out, account links) | [`mrdoorba/coms-account-widget`](https://github.com/mrdoorba/coms-account-widget) | Tag bump → consumer pin update |
| **One specific page's layout or behavior** | Your app's own repo (`apps/web/src/routes/**` for portal, `packages/web/src/routes/**` for Heroes, etc.) | Direct edit; no version bump |
| **App-local component** that doesn't belong in the suite | Your app's own `lib/components/` | Direct edit; no version bump |

When in doubt, ask: **"who else needs this change?"** Both apps or any future app → shared package. Only this app, ever → app's own repo.

---

## The map

The COMS design system ships across three standalone GitHub repos, each consumed by every app via `git+url` tag pin (no workspace deps, no monorepo):

```
mrdoorba/coms-design-tokens  ─►  Tokens (CSS variables, @theme bindings, semantic colors)
                                  Owned by: portal team
                                  Touches: every styled element in every app

mrdoorba/coms-ui             ─►  Chrome (ServiceBar, Sidebar, MobileTopBar, MobileBottomNav)
                                  + Primitives (Button, Card, Dialog, Input, Select,
                                                Table, Tabs, Avatar, Badge, Sheet,
                                                DropdownMenu, Skeleton, Separator,
                                                Label, Textarea — 15 families)
                                  + Compositions (currently stub)
                                  + cn() helper at src/utils.ts
                                  Owned by: portal team
                                  Touches: every page in every app

mrdoorba/coms-account-widget ─►  AccountWidget (avatar popover, sign-out flow)
                                  Owned by: portal team
                                  Touches: chrome's right slot in every app
```

Apps consume these like any external package:

```jsonc
// apps/web/package.json (portal) — same shape in Heroes' packages/web/package.json
"dependencies": {
  "@coms-portal/design-tokens": "git+https://github.com/mrdoorba/coms-design-tokens.git#v1.1.0",
  "@coms-portal/ui": "git+https://github.com/mrdoorba/coms-ui.git#v1.2.0",
  "@coms-portal/account-widget": "git+https://github.com/mrdoorba/coms-account-widget.git#v0.2.0"
}
```

Tag pins are explicit. Upgrading a consumer to a new version is a deliberate one-line PR per app.

---

## Where to make changes — decision tree

Walk this tree before opening a PR:

```
Is the change visible in more than one app, OR likely to be?
│
├── No (only this app, ever) ──────► Edit in your app's own repo. Stop reading.
│
└── Yes
    │
    ├── Is it a value (color, spacing, radius, font, shadow, asset)?
    │   └── Edit in coms-design-tokens. (See "Token changes" below.)
    │
    ├── Is it a building block (Button, Card, Dialog, etc.)?
    │   └── Edit in coms-ui/src/primitives/. (See "Primitive changes" below.)
    │
    ├── Is it the suite's frame (top bar, sidebar, mobile chrome)?
    │   └── Edit in coms-ui/src/chrome/. (See "Chrome changes" below.)
    │
    └── Is it the account avatar/popover/sign-out?
        └── Edit in coms-account-widget. (See "Widget changes" below.)
```

If your change touches **multiple layers** (e.g. "a new brand color and a new Button variant that uses it"), do them as **separate PRs in dependency order** — tokens first, then primitive — so each repo can ship its own tag and consumers upgrade incrementally.

---

## Local development loop — test before PR

You have an idea. You want to see it live in your app before opening a PR upstream. Use a `file:` path reference to point your app at a local clone of the shared repo.

### Step 1 — Clone the shared repo locally

```bash
cd /path/to/your/projects
git clone https://github.com/mrdoorba/coms-ui.git
# or coms-design-tokens / coms-account-widget
```

### Step 2 — Swap the package pin

In your app's `package.json`, replace the `git+url` pin with a `file:` path:

```jsonc
// before
"@coms-portal/ui": "git+https://github.com/mrdoorba/coms-ui.git#v1.2.0",

// after (during local dev only)
"@coms-portal/ui": "file:/path/to/your/projects/coms-ui",
```

Run `bun install` (or your package manager). Your app now consumes the local checkout.

### Step 3 — Edit, save, hot-reload

Edit files inside the local clone of `coms-ui/src/` directly. Your app's dev server (`bun run dev`) will hot-reload because Vite/SvelteKit watches the resolved path.

Iterate freely. The change is real — no publish step.

### Step 4 — Open the PR upstream

When the change is ready, commit + push to a branch in the shared repo (e.g. `mrdoorba/coms-ui`) and open a PR. Reset your `package.json` to the original `git+url` pin (don't ship a `file:` reference to main).

### Step 5 — After the PR merges and tags

The shared repo cuts a new tag (e.g. `v1.3.0`). Update each consumer app's `package.json` pin to the new tag, run install, verify, commit per app.

---

## PR workflow — what to file, what to include

### Where to file

| Change scope | PR target |
|---|---|
| Token | `mrdoorba/coms-design-tokens` |
| Primitive or chrome | `mrdoorba/coms-ui` |
| Account widget | `mrdoorba/coms-account-widget` |

### What the PR description should cover

- **What changes.** Concrete description of the edit.
- **Why.** What problem does this solve, or what consistency does it improve? Link to the issue/ticket if there is one.
- **Visual diff.** Before/after screenshots, or at minimum a clear written description of how the change looks.
- **Consumer impact.** Will every app need to update? Will any app break? Is this a breaking change?
- **Test plan.** What did you verify locally? In which app? Light + dark mode both checked?

### Reviewer expectations

- **Token PR:** at least the portal team reviews. Every consumer app inherits the change — review threshold is high. Prefer additive changes (new token, new variant) over re-tuning existing tokens, which forces every consumer to re-verify.
- **Primitive PR:** portal team + at least one consumer app representative (whoever uses the primitive most). Changes to existing primitives must preserve API; new primitives can ship freely.
- **Chrome PR:** portal team + every consumer app's UX lead. Chrome is the most-visible surface; a change here is felt by every user immediately.
- **Widget PR:** portal team. The widget has a small surface and clear contract.

### What gets pushed back

- "I want a one-off variant for my app." → Either upstream the variant for everyone, or compose locally with a wrapper. Don't fork the primitive.
- "I want to change a color just for my app." → Tokens are suite-wide. If your app needs a per-app brand accent, propose a per-tenant theming pattern (a future spec); don't override globally.
- "I edited `node_modules/@coms-portal/ui/...` directly." → That edit will vanish on next install. Open a PR upstream.

---

## Versioning rules

Each shared package follows semver:

- **Patch (`1.2.0` → `1.2.1`):** bug fix, visual tweak that doesn't change the API or break visual parity. No consumer action required beyond updating the pin.
- **Minor (`1.2.0` → `1.3.0`):** additive change — new component, new variant, new prop with a default that preserves existing behavior. Consumers can upgrade safely.
- **Major (`1.2.0` → `2.0.0`):** breaking change — renamed component, removed prop, changed default that affects rendering. Migration notes must accompany the release. Consumers schedule the upgrade explicitly.

Pre-1.0 packages (`0.x.y`) treat minor bumps as breaking. Post-1.0 packages must respect the contract.

The package author bumps the version in `package.json` and adds a `CHANGELOG.md` entry as part of the same PR. CI/release follows on merge.

Consumers do NOT auto-update. Every consumer pins a specific tag and updates explicitly with a one-line PR per app.

---

## Forbidden patterns (will be rejected at review)

- **Forking a shared component back into an app.** If you need a variant, propose it upstream. Heroes ran a local `ui/` directory for months before adopting `@coms-portal/ui v1.2.0` — that fork drift is exactly what this design system exists to prevent.
- **Editing `node_modules/...` directly.** Your edit vanishes on next install. Open a PR upstream.
- **Hardcoded hex colors in app code.** Use semantic Tailwind classes (`bg-card`, `text-foreground`, `border-border`, `text-muted-foreground`) bound to design tokens. They flip to dark mode for free. Hardcoded `#1a1b2e` does not.
- **Inline override of primitive styles** (e.g. `<Button class="!bg-purple-500 !rounded-none !px-12">`). If the primitive doesn't support what you need, propose a variant. Inline overrides are a fork in disguise.
- **Bypassing the tag pin** with `git+...#main` instead of `git+...#v1.2.0`. Untagged consumption breaks reproducibility and surprises every consumer when the package author pushes to main.

---

## Where things are NOT in scope of the design system

The design system is a **kit**, not a finished house. It does not own:

- **Page layouts and routes** — those are your app's job. The design system gives you the building blocks; you compose them into pages.
- **Domain components** — Heroes' Leaderboard, portal's admin tables, future H-apps' bespoke widgets. These stay in their respective app repos. If a domain component becomes generic across two apps, *then* it's a candidate to lift into `@coms-portal/ui/compositions/`.
- **Business logic** — forms, mutations, queries, data shaping. Use the design system primitives for the visual layer; keep business logic in your app.
- **Per-tenant branding** — multi-tenant theming (per-org colors, per-org logos) is a future spec. Today every consumer renders the same brand.

If you find yourself reaching for the design system to do something it doesn't do, the answer is usually "compose it locally" or "propose a new spec," not "fork the primitive."

---

## How to discuss before opening a PR

Most changes deserve a quick conversation before the PR. Open an issue on the relevant repo:

- "I'm thinking the Button hover state should be slightly darker — does anyone disagree?" (`mrdoorba/coms-ui` issues)
- "Heroes wants a smaller mobile chrome height — what would the impact be on portal?" (`mrdoorba/coms-ui` issues)
- "Can we add a `success` color token? Heroes has a use case." (`mrdoorba/coms-design-tokens` issues)

Discussion-first works because most "I think this could be better" intuitions need calibration against other consumers' constraints. The portal team or other consumer leads will tell you "yes, do that" or "actually here's a constraint you don't see from your side." This saves rejected PRs.

For trivial fixes (typo in CHANGELOG, obvious bug fix, clear lint issue), skip the issue and open the PR directly.

---

## Reference: per-repo CONTRIBUTING.md

Each shared repo also carries a short `CONTRIBUTING.md` with repo-specific commands (typecheck, build, branch rules) — see them for local-dev specifics:

- [`mrdoorba/coms-ui/CONTRIBUTING.md`](https://github.com/mrdoorba/coms-ui/blob/main/CONTRIBUTING.md)
- [`mrdoorba/coms-design-tokens/CONTRIBUTING.md`](https://github.com/mrdoorba/coms-design-tokens/blob/main/CONTRIBUTING.md)
- [`mrdoorba/coms-account-widget/CONTRIBUTING.md`](https://github.com/mrdoorba/coms-account-widget/blob/main/CONTRIBUTING.md)

This document is the canonical source. The repo-level `CONTRIBUTING.md` files are pointers back to here plus repo-specific notes.

---

## Reference: spec docs

For the full architecture rationale and history of the design system:

- `docs/architecture/rev3/spec-02-design-system.md` — Spec 02 (skeleton + Phase 1–4 history)
- `docs/architecture/rev3/spec-01-account-widget.md` — Spec 01 (account widget contract)

These are the design intent. This document (`DESIGN_SYSTEM.md`) is the contribution workflow.

---

## Quick reference — common scenarios

**"I want to change the brand primary color across the suite."**
→ Edit `coms-design-tokens/src/tokens.yaml`, regenerate `tokens.css`, bump minor (or major if it's a notable rebrand), tag, push. Every consumer updates the pin in their `package.json`.

**"I want to add a `Checkbox` primitive."**
→ Open an issue on `coms-ui` first to confirm the API shape (does it use `bits-ui`? what variants? sizing?). Then PR to `coms-ui/src/primitives/checkbox/`, update the barrel, bump minor, tag, push.

**"Heroes' service bar should be 4px taller on tablet."**
→ This is a chrome change. PR to `coms-ui/src/chrome/ServiceBar.svelte`. Discuss first — portal will inherit the same height.

**"My app needs a one-off button variant in this single page."**
→ First, ask: would another app want it? If yes, propose the variant upstream. If no, compose locally:
```svelte
<Button class="bg-gradient-to-r from-purple-500 to-pink-500">…</Button>
```
But default to upstreaming — the variant rarely stays one-off for long.

**"I see a typo in a CHANGELOG."**
→ Open the PR directly, no issue needed. Patch bump unwarranted unless the CHANGELOG misrepresents shipped behavior.

---

*Document maintained by the portal team. Last updated: 2026-04-30. PRs welcome — open one against this file in `coms_portal`.*
