# Spec 02: Heroes Integration Cleanup

> Status: draft
> Type: one-shot (executable plan; document dies once executed)
> Owner: TBD
> Prerequisites: Spec 01 (Monorepo Consolidation) complete
> Targets: integration contract §§ 1, 2, 3, 5; ADR 0003, 0005, 0006

## Objective

Bring heroes' integration with portal into alignment with the integration contract on every section **except §10 Notifications** (heroes' notifications remain app-local until the platform-notifications spec ships — see *Known deviation: notifications* below). Heroes' current state was the "jumbled" pilot — it works, but it carries legacy patterns from when heroes ran its own Better Auth credential provider, lives on a separate origin from portal, and has app-side glue that should live in the chrome libraries.

By end of this spec, heroes is the **reference implementation for §§ 1–9 and §§ 11–14** of the integration contract — the model aha-fast and future apps integrate against, with the notifications deviation explicitly flagged so no one copies that part.

## Success criteria

This spec is done when all of the following are true:

- [ ] Heroes is served at `coms.com/heroes/*` via Firebase Hosting rewrites (no separate origin).
- [ ] Heroes' SvelteKit app is configured with `kit.paths.base: '/heroes'`.
- [ ] Heroes has no `session`, `account`, or `verification` tables in its schema. Auth state is verified per-request from portal-issued JWTs via SDK.
- [ ] The `portal_code` exchange flow's steady-state usage is removed. Initial-login redirect from portal → heroes works without minting an app-local session row.
- [ ] AuthUser derivation happens in **one** place (a shared function called by both `hooks.server.ts` and `server/src/middleware/auth.ts`). Both sites return the same shape.
- [ ] `serviceBarServices` in heroes' layout is derived from `APP_LAUNCHER × user.apps`, not hardcoded.
- [ ] App-side chrome glue (theme narrowing, app switcher building, mobile slide-over admin menu) is either absorbed into the chrome library or simplified to a minimum.
- [ ] `email_cache` and `userConfigCache` tables are evaluated: data needed at every request lives in JWT claims; data needed less frequently can stay cached, but the per-request 3-table JOIN goes away.
- [ ] Heroes' notifications remain app-owned for this spec (platform-owned notifications is a separate future spec).
- [ ] Heroes' existing functionality has zero regression. All tests pass; manual smoke test of the dashboard, leaderboard, points submission, and admin views succeeds.

## Out of scope

- aha-fast onboarding (separate spec).
- Platform-owned notifications (separate future spec).
- New features for heroes.
- Cleanup of heroes' app-internal code that doesn't touch integration (the points engine, the leaderboard, the admin views — leave those alone).
- The React UI lib variant (heroes is Svelte; React libs are aha-fast's concern).

## Order of operations

Sequenced to keep heroes deployable at every checkpoint. Don't reorder without justification.

### Phase 1: Single-origin migration

The architecturally biggest change. Until this lands, the auth simplifications can't work cleanly.

1. **Configure `kit.paths.base: '/heroes'`** in `apps/heroes-web/svelte.config.js`.
2. **Audit all internal links** in heroes-web for base-path compliance:
   - Replace any `href="/dashboard"` literal with `${base}/dashboard` from `$app/paths` (or framework-native equivalent).
   - Verify form actions, redirects, asset URLs honor the base path.
3. **Update heroes-api's Elysia router** to prefix routes with `/heroes/api` (or whatever the API base path is). All endpoints heroes-web calls move to the new prefix.
4. **Update heroes-web's eden client config** to use the new API base path.
5. **Add Firebase Hosting rewrite** for `/heroes/**` → heroes-web Cloud Run, and `/heroes/api/**` → heroes-api Cloud Run.
6. **Update the `(authed)/+layout.svelte`** in heroes-web:
   - Remove `data.portalOrigin` and `data.heroesOrigin` usage.
   - The `ServiceBar` services list uses path-relative `href`s: `[{ slug: 'portal', label: 'COMS', href: '/' }, { slug: 'heroes', label: 'Heroes' }]` — and even better, this becomes derived from APP_LAUNCHER (see Phase 4).
   - `postLogoutRedirectUri` becomes the path-relative `/logged-out` (no origin prefix).
7. **Verify locally and in staging**: heroes-web reachable at `https://<staging-host>/heroes/dashboard`. Sign-in from portal redirects correctly. Cross-app links work.

**Checkpoint:** Heroes lives at `/heroes/*`. Same origin as portal. Cookie crosses paths automatically.

### Phase 2: Replace local sessions with JWT verification

8. **Identify the JWT payload contract** by reading `@coms-portal/sdk`. The portal-issued JWT should carry: `sub`, `apps`, `portalRole`, `email`, `iat`, `exp`. If anything is missing, fix in the SDK first.
9. **Write a single AuthUser-derivation function** in `packages/heroes-shared/src/auth/user.ts` (or similar location):
   ```ts
   export async function loadHeroesAuthUser(jwt: PortalJWT): Promise<HeroesAuthUser | null> {
     // 1. Validate jwt.apps.includes('heroes'); if not, return null (will 403).
     // 2. Upsert heroes_profiles for jwt.sub.
     // 3. Load heroes_profiles + (still-cached app-specific data).
     // 4. Return HeroesAuthUser with all expected fields.
   }
   ```
   The function is called by both `hooks.server.ts` and `server/src/middleware/auth.ts`. Same shape, no drift.
10. **Replace `hooks.server.ts` auth handle** with: verify JWT via SDK → call `loadHeroesAuthUser` → set `event.locals.user`.
11. **Replace `server/src/middleware/auth.ts`'s `authPlugin`** similarly: verify JWT via SDK → call `loadHeroesAuthUser` → derive `authUser`.
12. **Remove `getLocalSessionByToken`, `createLocalSessionForPortalUser`, `destroyLocalSessionByToken`, `destroySessionsForPortalSub`** and friends from `packages/heroes-shared/src/auth/session.ts`.
13. **Migrate**: write a migration that drops `session`, `account`, `verification` tables. Run in a maintenance window after verifying no code path reads them.
14. **Verify**: heroes auth still works end-to-end. Sign-in, page load, API call, logout — all green.

**Checkpoint:** Heroes has no local session tables. JWT-only.

### Phase 3: Adjust the portal handoff for first-login

15. **Audit `/auth/portal/exchange`'s remaining role.** Now that cookies cross paths within the origin, the steady-state exchange isn't needed. The initial first-arrival redirect (portal mints cookie at the same origin) may still funnel through a thin handoff route, but the route does NOT mint a session row anymore.
16. **Refactor the route** to:
    - Receive the redirect from portal after portal sets the `coms_session` cookie at the shared origin.
    - Optionally redirect the user to `redirectTo` (preserving the safe-redirect logic).
    - No DB write. No session minting.
17. **Or, if portal's login flow already sets the cookie before redirect and there's nothing for heroes to do at handoff**, delete the route entirely and have portal redirect directly to `/heroes/dashboard`.

**Checkpoint:** No app-local session minting. Portal owns the cookie.

### Phase 4: Chrome library glue

The `(authed)/+layout.svelte` currently does a lot of glue that every app would repeat. Push it into the chrome library where it belongs.

18. **Service bar services**: replace the hardcoded `[{ slug: 'portal' }, { slug: 'heroes' }]` with derivation from `APP_LAUNCHER × user.apps`. Wherever this derivation logic ends up identical to what aha-fast and future apps will write, **pull it into `@coms-portal/ui-svelte/chrome` as a helper or have `ServiceBar` accept the catalog and user.apps directly and do it internally.**
19. **Theme narrowing**: `effectiveTheme = uiState.theme === 'system' ? 'light' : uiState.theme` is glue every app will write. Either push the narrowing into chrome (it accepts `'system' | 'light' | 'dark'` and resolves internally) or expose a shared `resolveTheme()` helper from `@coms-portal/ui-svelte`.
20. **Icon type casting**: `AnyIcon` cast and "version-skew artefact" comment go away once everything is `workspace:*` and the icon library version is unified across the monorepo (which is structural in the consolidated tree).
21. **Mobile slide-over admin menu**: this is heroes-specific (admin nav). But the *pattern* (slide-over panel triggered from MobileTopBar's leading slot) might become a chrome lib `<SlideOverNav>` component. Decide whether to genericize or leave heroes-local; if leaving local, it's fine — not every nicety needs to be shared.

**Checkpoint:** Heroes' layout file shrinks meaningfully. The chrome lib absorbs the cross-app glue.

### Phase 5: Evaluate caches

22. **For each of `email_cache` and `userConfigCache`**: identify what data they hold and what consumers need it.
    - If a piece of data is in the JWT (email, basic profile bits, portalRole, apps), **delete the cache column** — the JWT is the source.
    - If a piece is *not* in the JWT but needed at every request (e.g., `userConfigCache.canSubmitPoints`): consider whether it belongs in the JWT (a portal-issued claim) or in `heroes_profiles` directly. Migrate to whichever fits better.
    - If a piece is only needed sometimes: keep it cached, but it doesn't have to be in the per-request JOIN.
23. **Reduce the per-request JOIN** in `loadHeroesAuthUser` from 3 tables to 1 (`heroes_profiles`) wherever possible.
24. **Webhook events**: keep the `portal_webhook_events` table and the webhook consumer. They're not stale-cache problems; they're event log. Used for things like deactivation propagation that need immediate effect.

**Checkpoint:** Auth-path query reduced. Caches retained only where they earn their keep.

### Phase 6: Verification and documentation

25. **End-to-end smoke**:
    - Sign in via portal, land on heroes.
    - Navigate within heroes, between apps, between routes.
    - Logout from one app, verify logged out everywhere.
    - Mobile chrome: install PWA, log in, verify chrome looks identical to portal's.
    - Admin operations: heroes' admin views work (HR sync, audit log, settings).
26. **Performance check**: heroes' authed page load time, p50 and p95. Should be flat or faster (one fewer DB query).
27. **Update heroes' README** to point at the integration contract. Remove any documentation about local session tables. Document the cleaned auth flow as "this is the reference pattern for new app integrations."

**Checkpoint:** Heroes is the clean reference. Future apps look here for the pattern.

## Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Phase 1's base-path migration breaks scattered absolute links | High | Audit thoroughly. Each `href="..."` and `goto("...")` and `redirect("...")` reviewed. Run heroes against a base-path-prefixed staging URL before any production cutover. |
| JWT migration leaves a window where heroes can't auth | Medium | Ship the JWT path alongside (not replacing) the session-table path first; cut over with a flag; remove tables only after weeks of stable JWT-only operation. |
| The SDK doesn't actually carry the claims we need | Medium | Verify before Phase 2 begins. If anything's missing, land the SDK update first. |
| Chrome lib changes (Phase 4) break portal-web | High | Portal-web consumes the same chrome lib. Any chrome change is validated against portal-web first. Visual regression tests catch unintended drift. |
| Webhook consumer's existing logic relied on session staleness (e.g., didn't propagate access revocation because session would expire eventually) | Low | Audit `portal_webhook_events` consumers for assumptions about session lifetime. |
| Hidden code path reads dropped tables | Medium | Grep before drop migration: `git grep -E '\b(session|account|verification)\b' apps/heroes-*` and verify no live reads. |

## Verification

After each phase's checkpoint:

- All heroes tests pass.
- Heroes builds, deploys, and serves successfully.
- Auth end-to-end test (login → page load → API call → logout) is green.
- Visual parity with portal-web's chrome (DevTools / Storybook side-by-side).

## Open questions

- Token lifetime policy. Portal sets it; what's the value? (Affects revocation responsiveness, see ADR 0005.)
- Will portal's `coms_session` cookie be set at exchange time or earlier? (Affects what Phase 3's handoff route does — or whether it exists at all.)
- Does `userConfigCache.canSubmitPoints` belong in the JWT, in `heroes_profiles`, or as a per-request portal API call? (Phase 5 decision.)

## When this spec is done

Heroes is the reference implementation for the integration contract **as scoped by this spec**. The next time a new product app onboards (aha-fast, app 3, app 4), the engineer reads:

1. `docs/integration-contract.md`
2. The relevant ADRs
3. Heroes' code as the canonical example for §§ 1–9 and §§ 11–14

…and produces an integration that matches the same pattern, without re-litigating the architecture.

### Known deviation: notifications

Heroes retains an app-local notifications implementation after this spec completes. This is a **deferred workstream**, tracked in a future *Platform-owned notifications* spec, not a green-lit pattern. New apps **must not** copy heroes' notifications code; new apps adopt the platform-owned pattern from day one (or omit notifications until the platform spec ships and provides the SDK surface).

This is the one place where "look at heroes" produces the wrong answer. Future onboarding documentation and any AI-agent reference should flag this exception prominently.
