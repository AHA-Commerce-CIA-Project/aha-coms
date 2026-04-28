# Rev 3 — Spec 05: Suite Search / Command Palette

> Priority: **Deferred. Not critical-path; ships when N > 6 apps or first cross-app search request lands.**
> Scope: Portal (search registry, ranker, federation endpoint) + every H-app (search provider plugin, optional).
> Prerequisites: Rev 3 Spec 01 (account widget — launcher entry point lives in chrome).

---

## Overview

A keyboard-launchable command palette (`Cmd+K` / `Ctrl+K`) that fronts:

1. **App switching.** "Open Heroes," "Go to portal admin." Same outcome as the service bar / widget popover, but keyboard-first.
2. **Recent items.** Last N pages or records the user touched, across the suite. Acts like AWS's "Recently visited" in the Services menu.
3. **Cross-app deep search.** "Find customer Jane Smith" — every app exposes a search provider; portal federates the queries and ranks results.

Reference behaviors:

- **AWS Console:** "Services" menu doubles as a search box; `Alt+S` focuses it. Federates across AWS services.
- **GitHub:** `Cmd+K` opens a context-aware palette — repo, file, PR, action.
- **Linear / Notion:** `Cmd+K` is the primary navigation surface, even more than the sidebar.
- **Microsoft 365:** suite-wide search bar in the top header, federates across products.

Pattern: **one keystroke, one input, results from anywhere in the suite, ranked.** Once it works, users stop using the sidebar.

---

## Why this is deferred

Two preconditions are missing today:

1. **Not enough surface to search.** With portal + Heroes (2 apps, ≤6 in projection), the service bar already gives one-click app switching. A palette adds keyboard convenience but no new capability.
2. **No app exposes a search API yet.** Federated search needs every consenting app to publish a search-provider endpoint with a known contract. Building the federation layer before any provider exists is speculative.

So: full architecture decided here; implementation deferred until value materializes.

### Triggers to ship

Any one of these unblocks Phase 1:

1. **N > 6 apps.** Service bar overflows; users need keyboard navigation.
2. **First cross-app search request.** Someone asks "can I find a customer in Heroes from the portal admin screen?" — that's the moment federation pays for itself.
3. **An app builds an internal palette.** If Heroes ships its own `Cmd+K`, port it upstream into `@coms-portal/ui` and add federation, rather than letting per-app palettes diverge.
4. **Recent-items demand.** Users start asking "where was I last week" — the recent-items feed is half the value and is cheaper than search.

---

## Decisions Up Front

### Launcher: shared component in `@coms-portal/ui`

Ships as `<CommandPalette>` from `@coms-portal/ui/chrome` (Spec 02). Portal mounts it; H-apps mount it. Single binding (`Cmd+K` / `Ctrl+K`), single visual treatment, single keyboard-shortcut convention across the suite.

The widget is **modal** (full-screen overlay on mobile, centered card on desktop) — not a dropdown. AWS/Linear/GitHub all converged on modal because results need vertical room.

### Three result categories, one ranker

The palette returns three flavors of result, blended into a single ranked list:

| Category | Source | Latency | Fallback |
|----------|--------|---------|----------|
| **Apps** | Static — from `appSwitcher` already loaded in chrome | Instant (zero RTT) | Always available |
| **Recent items** | Per-app feed, posted to portal as the user navigates | <100ms (portal-cached) | Empty list if not posted |
| **Search results** | Federated across registered search providers | <500ms p95 budget | Skip on timeout |

Ranking blends the three: pinned apps and exact-match recents float to top; search results follow. Default sort is *relevance + recency*, not *category*.

### Search provider contract

Each H-app that wants to be searchable exposes:

```
POST /api/search
Authorization: <portal service token>
Body: { query: string, limit: number, userPortalSub: uuid }
Response: {
  results: Array<{
    id: string                        // app-stable identifier
    title: string                     // primary text
    subtitle?: string                 // secondary text
    url: string                       // deep link
    icon?: string                     // optional icon name from lucide-svelte
    score?: number                    // 0..1 — app's own relevance signal
    type?: string                     // 'customer' | 'order' | 'page' | ...
  }>
}
```

Portal calls each registered provider in parallel with the user's query, applies a 500ms timeout per provider, blends results, returns to the palette. Apps that don't respond in time are skipped — palette never blocks on a slow provider.

Provider registration is portal-side admin: each app registers its `/api/search` URL and a service token. No new auth surface — reuses Rev 2 Spec 04 service-to-service token pattern.

### Recent-items feed

Apps post user activity to portal as the user navigates:

```
POST /api/me/recents
{ appSlug, type, id, title, subtitle?, url }
```

Portal stores the last N (target 50) per user, dedupes on `(appSlug, type, id)`, returns oldest-out on overflow. The palette reads `GET /api/me/recents` on open.

Apps do this fire-and-forget on route load. Failure is non-blocking. No portal call → no recent item; palette degrades gracefully.

### Authorization: query-time enforcement, not registration-time

Portal does **not** filter results based on what the user can access. Each provider is responsible for filtering against `userPortalSub` — return only results that user is allowed to see. This pushes the auth boundary to the data owner (the app), where it belongs, and keeps portal stateless.

A user querying "Jane Smith" who isn't authorized to see her in Heroes simply gets zero Heroes results, not a permission-denied surface.

### Keyboard shortcut: `Cmd+K` / `Ctrl+K` only

No alternate bindings (no `Cmd+P`, no `/` to focus, etc. — apps may have their own per-page shortcuts but the suite-wide palette is exactly one chord). Reasons:

- One thing to teach.
- Avoids collisions with apps' page-level shortcuts (Heroes' filter, etc.).
- Matches industry consensus.

The shortcut is **always live** — even on text inputs, `Cmd+K` opens the palette. Users escape with `Esc`.

### Empty state

When the input is empty, the palette shows:

1. Pinned apps (default: all from `appSwitcher`).
2. Recent items (last 10).
3. Suggested actions (TBD per phase — initially just "open settings").

Big-vendor reference: this is exactly what Linear, GitHub, and AWS show on `Cmd+K`-with-empty-input. Users expect to discover capabilities here.

---

## Phasing

### Phase 1 — App-only palette (no federation, ~3 days)

- `<CommandPalette>` in `@coms-portal/ui/chrome`.
- Searches over `appSwitcher` only (already loaded, zero RTT).
- `Cmd+K` opens, arrow-keys navigate, Enter opens.
- Ships in portal first; Heroes adopts via the chrome upgrade.

This alone is Linear-grade UX for app switching. Useful even before any search providers exist.

### Phase 2 — Recent items (~2 days)

- `POST /api/me/recents` + `GET /api/me/recents`.
- Portal app posts on every route change.
- Heroes adopts via shared `useRecents()` hook in `@coms-portal/ui`.
- Palette empty-state and result blend updated.

### Phase 3 — Federated search (~5–7 days)

- Search-provider registry table on portal.
- `POST /api/suite/search` federation endpoint with timeout/parallel-fanout.
- First provider: portal's own search (users, apps).
- Heroes ships `/api/search` provider next.

### Phase 4 — Suggested actions / shortcuts (~ongoing)

- "Settings," "Sign out," "Switch app," etc. as palette commands.
- App-level commands (Heroes adds "create reward," etc.) registered via a per-app static manifest.

---

## Out of Scope

- **Natural-language / LLM-powered search.** Lexical match + per-app score is enough. LLM federation is its own (much later) project.
- **Saved searches / search history.** Recent-items covers the practical use case.
- **Workflow automation from the palette** (e.g., "create reward for Jane Smith" as one keystroke). Palette is read-mostly in v1; write actions stay in the apps.
- **Per-tenant or per-team scoping.** All searches are user-scoped. Multi-tenant scoping is portal's broader concern, not the palette's.

---

## Success Criteria

Phase 1 done when:

1. `Cmd+K` in portal or Heroes opens a modal palette.
2. Typing filters across apps from `appSwitcher`; Enter opens.
3. Same component, same shortcut, same UX on both apps.

Full Spec 05 done when:

1. A user types `Cmd+K` in any app and sees blended results: pinned apps + last 10 recents + cross-app search hits, ranked.
2. At least two apps register search providers and respond within the latency budget.
3. Slow / failing providers are silently skipped — palette never blocks.
4. Authorization is correct: a user only sees results they have permission to access in the originating app, with no portal-side leakage.
5. Onboarding a new H-app's search is documented as a one-endpoint contract: ship `/api/search`, register with portal, done.
