# Spec 08: Stateless JWT Sessions

> Status: **draft 2026-05-20** — design captured, no code landed.
> Type: one-shot (executable plan; document dies once executed, like Specs 01/02/05/06).
> Owner: TBD
> Prerequisites: Spec 06 PR F (sealed) — session payload now carries `passwordSetupRequired`, lockout column wired; the JWT path must mirror that shape.
> Targets: ADR 0005 (stateless JWT sessions) — the deferred resolution from Spec 02 T31; integration contract §§ 1, 2 (auth) + § 13 (observability).

## Objective

Deliver ADR 0005's promise. Eliminate the per-request DB roundtrip against `auth_sessions` that fires on every authenticated request across portal-api, portal-web, heroes-api, heroes-web, and fast.

After this spec lands, an authenticated request:

- Carries a real JWT in the `__session` cookie value (not an opaque session-row UUID)
- Is verified locally via `@coms-portal/sdk` (no DB read, no network call to `/api/userinfo`)
- Falls through to a portal-side "revoked subs" cache only when the user has been signed-out-everywhere or had their app grants revoked

## Why this exists — the deferred T31 resolution

ADR 0005 (`docs/adr/0005-jwt-stateless-sessions.md`) declared sessions stateless JWTs. Spec 02 Phase 2 (T31, sealed during the heroes-cleanup window) was the original implementation slot. When T31 ran, the discovery was:

> Portal's `__session` cookie value is an **opaque UUID** (`auth_sessions.id`, created in `apps/portal-api/src/services/sessions.ts:126`) — not a JWT. SDK does expose `verifyBrokerToken` (for short-lived broker tokens) and `introspectSession` (which requires already-known `userId+sessionIssuedAt`), but neither is the "given a session cookie value, return the user" primitive heroes needs. The existing portal-api route at `apps/portal-api/src/routes/userinfo.ts` (`GET /api/userinfo`) IS that primitive: it takes the `__session` cookie, runs `validateSession()`, and returns `{ sub, name, email, portalRole, apps, … }`. No SDK changes needed — heroes uses `fetch()` directly.

The T31 resolution unblocked heroes by routing through `/api/userinfo`, but the **DB roundtrip moved to portal-api** rather than disappearing. Today every authenticated request on every web surface results in either:

- **Portal-api / portal-web** — `validateSession(sessionId)` reads `auth_sessions` by id, checks `revoked_at`, validates `expires_at` (one row read, one index lookup)
- **Heroes-web / heroes-api / fast** — `fetch('https://aha-coms.web.app/api/userinfo')` → portal-api → same DB read

At ~1 RPS sustained authenticated traffic across all surfaces, that's ~86k DB reads per day on the hot path. Stateless JWT verification eliminates them.

## Current state (where the DB reads happen)

| Surface | Entry point | What it does today |
|---|---|---|
| portal-api | `apps/portal-api/src/middleware/auth.ts:106` | `await validateSession(sessionCookie)` reads `auth_sessions` |
| portal-web (SSR) | `apps/portal-web/src/hooks.server.ts:70-75` | In-process `validateSession` call (post-FU-12 loopback seal `26841b8`) |
| heroes-web (SSR) | `packages/heroes-shared/src/auth/user.ts:88` (`loadHeroesAuthUser`) | `fetch('/api/userinfo')` — portal-api hits its DB |
| heroes-api | `apps/heroes-api/src/middleware/auth.ts` | Calls portal-api's userinfo per request |
| fast (SSR) | `apps/fast/lib/auth/loadFastAuthUser.ts` | Mirror of heroes; `fetch('/api/userinfo')` |

Five hot paths. One underlying DB read per request.

## Success criteria

This spec is done when all of the following are true:

- [ ] `__session` cookie value is a JWT — decodable to `{ sub, name, email, portalRole, apps, authMethod, passwordSetupRequired, iat, exp }` payload + valid signature against portal's signing key
- [ ] `@coms-portal/sdk` exports `verifyRequest(req)` returning `PortalSessionUser | null` — pure local verification, no network call, no DB read
- [ ] `apps/portal-api/src/middleware/auth.ts` reads the JWT first; falls back to `auth_sessions` lookup only for pre-migration opaque-UUID cookies; emits a `legacy_session_validate` counter on each fallback so the cutover can be observed
- [ ] `loadHeroesAuthUser` / `loadFastAuthUser` verify locally via SDK; `fetch('/api/userinfo')` survives only as the pre-migration fallback path
- [ ] `apps/portal-web/src/hooks.server.ts` uses SDK verification; per-request DB query count drops by 1 on hot paths (measured via `pg_stat_statements` before/after)
- [ ] Revocation list exists — `portal_revoked_subs` table (or equivalent cache) listing subs revoked within the last `JWT_MAX_TTL`. SDK checks this list per request (in-memory cache with portal-side invalidation on revocation events); when admin invokes Spec 06 PR E's sign-out-everywhere, the revocation propagates to all apps within the cache TTL (proposed 60s, configurable via env)
- [ ] Steady-state: `auth_sessions` reads = 0 on session-validation hot paths (existing row writes for new-session minting remain — the table doesn't get dropped)
- [ ] Test suite covers: JWT mint → SDK verify round-trip; expired token rejected; invalid signature rejected; revoked sub rejected; pre-migration opaque-UUID fallback path
- [ ] ADR 0005 addendum recording the resolution (the original ADR's promise now delivered + cite this spec)

## Out of scope

- **JWT key rotation** — initial implementation uses portal-api's existing GIP service-account key. Rotation strategy is a follow-up (probably needed before public-launch but not a v1 blocker)
- **Refresh tokens** — short-lived JWTs (proposed 15min) without refresh means re-auth on expiry. Refresh-token plumbing is its own spec; today's web sessions are long enough that 8-hour JWTs cover a working day
- **App-side revocation cache** — the revocation list is portal-served. Apps don't cache it; each request asks via SDK (which itself may add a short-TTL cache in v2)
- **Auditing the JWT cookie's contents** — JWTs are signed not encrypted; payload is readable in any browser dev tools. We don't put secrets in the payload; today's userinfo response shape is already mostly-public. Worth confirming nothing sensitive ships in the JWT
- **Replacing `auth_sessions` table entirely** — keep the table for the migration window + for "manage your sessions" UX (Spec 06 PR E's `/api/me/sessions` panel needs an enumerable session record per device)

## Phases

### Phase 1: JWT minting + SDK verification primitive

Acceptance: portal-api mints JWTs alongside opaque-UUID cookies; SDK can verify locally. No consumers swapped yet.

- [ ] **F.1: Mint JWTs in portal-api's session-creation path.**
  - File: `apps/portal-api/src/services/sessions.ts` (extend, do not replace, the existing `createSession` path).
  - Sign with portal's GIP service-account credential (existing `GoogleAuth` plumbing in `gip-admin.ts`). Algorithm RS256. Payload: `{ sub, name, email, portalRole, apps, authMethod, passwordSetupRequired, iat, exp }`. TTL: 8 hours (matches current `auth_sessions.expires_at` default).
  - The `__session` cookie value becomes the JWT (replacing the opaque UUID). Existing `auth_sessions` row still inserted — F.6's revocation list reads from it.
  - **Acceptance:** `bun --filter @coms-portal/portal-api test` covers mint + decode round-trip; payload shape matches the documented success-criteria fields.

- [ ] **F.2: Author `sdk.auth.verifyRequest(req)` in `@coms-portal/sdk`.**
  - File: `packages/sdk/src/auth/verify-request.ts` (new).
  - Reads `__session` cookie; verifies signature against portal's public key (loaded from `PORTAL_JWT_PUBLIC_KEY` env, served by portal on a discovery endpoint similar to `/.well-known/jwks.json`); checks expiry; checks revocation list via SDK helper.
  - Returns `{ sub, name, email, portalRole, apps, authMethod, passwordSetupRequired } | null`.
  - **Acceptance:** Unit tests cover valid JWT → returns user; expired JWT → null; invalid signature → null; revoked sub → null; opaque-UUID cookie (legacy) → null (the consumer falls back to the existing `/api/userinfo` path).

### Phase 2: Cutover — swap consumers

Acceptance: every web surface verifies locally first; only falls back when SDK returns null.

- [ ] **F.3: Swap portal-api auth middleware.**
  - File: `apps/portal-api/src/middleware/auth.ts:106`. Read JWT first via SDK; if SDK returns null, fall back to `validateSession(sessionId)` against `auth_sessions` for backwards compatibility. Emit a `legacy_session_validate` counter on each fallback.
  - **Acceptance:** Workspace tests still pass; new test covers the dual-path (JWT-first, then legacy).

- [ ] **F.4: Swap `loadHeroesAuthUser` + `loadFastAuthUser`.**
  - Files: `packages/heroes-shared/src/auth/user.ts:88` (heroes), `apps/fast/lib/auth/load-fast-auth-user.ts` (fast).
  - Verify locally via SDK; if SDK returns null, fall back to `fetch('/api/userinfo')` so pre-migration cookies still work during the transition window.
  - **Acceptance:** Both apps' SSR rendering matches pre-migration behaviour; manual smoke covers both fresh-login (JWT path) and a pre-migration cookie injected via DevTools (fallback path).

- [ ] **F.5: Swap portal-web SSR.**
  - File: `apps/portal-web/src/hooks.server.ts:70-75`.
  - Use SDK verification first; fallback to in-process `validateSession` (cheap — same process, no network) for pre-migration cookies.
  - **Acceptance:** SSR render unchanged; per-request DB query count drops by 1 on the hot path.

### Phase 3: Revocation list + observability

Acceptance: admin sign-out-everywhere propagates within configured TTL; legacy-fallback counter is at zero in steady state.

- [ ] **F.6: Author the revocation list.**
  - Schema: `portal_revoked_subs(sub TEXT PRIMARY KEY, revoked_at TIMESTAMPTZ NOT NULL DEFAULT now(), reason TEXT)`. Drizzle migration.
  - SDK helper: `sdk.auth.isSubRevoked(sub): boolean` — reads from in-memory cache (TTL `JWT_REVOCATION_TTL_SECONDS`, default 60), refreshed via single round-trip to `GET /api/auth/revoked-subs?since=<lastfetch>`.
  - Spec 06 PR E's sign-out-everywhere (`apps/portal-api/src/routes/employees.ts:821`) writes to `portal_revoked_subs` alongside its existing `auth_sessions` revocation.
  - **Acceptance:** Admin signs out a user; within ≤60s every web surface rejects the user's JWT (test in stage env or local with TTL=5s for speed).

### Phase 4: Migration window + cutover gate

Acceptance: `legacy_session_validate` counter is 0 for 7 consecutive days; legacy fallback paths deleted.

- [ ] **F.7: Migration window.**
  - Phase 1 + Phase 2 + Phase 3 land behind no flag (the dual-path is itself the safety net).
  - Operator monitoring: `legacy_session_validate` counter via Cloud Monitoring; observe it tail off as opaque-UUID cookies expire over their natural 8-hour lifetime.
  - After 7 consecutive days at zero, open a final cleanup PR that removes the fallback branches in F.3, F.4, F.5. Keep `validateSession` itself for session-creation paths + the `/api/me/sessions` panel (Spec 06 PR E).
  - **Acceptance:** Cleanup PR merges; `auth_sessions` read count for validation = 0 in steady state.

### Phase 5: ADR addendum

- [ ] **F.8: ADR 0005 addendum.**
  - Append a dated addendum: "Resolution delivered via Spec 08. Sessions are now JWTs minted by portal-api, verified locally via `@coms-portal/sdk`. The opaque-UUID intermediate state (T31's resolution) survives only for new-session row records and the sessions-management UX. Revocation propagates within `JWT_REVOCATION_TTL_SECONDS` (default 60s) via the portal-served revoked-subs list."

## Risks worth tracking

- **Coordinated cutover across five services.** F.3/F.4/F.5 land roughly together. If portal-api ships JWT-minting before apps swap their verifiers, the apps' legacy fallback paths handle it (one extra `/api/userinfo` call per request). If apps ship verifiers before portal-api mints JWTs, SDK returns null and the apps fall back to legacy — same outcome. Either deploy order is safe.
- **JWT payload includes `passwordSetupRequired`.** Spec 06 PR F's session payload addition. When a user sets a password mid-session, the existing JWT still carries the old flag. Two options: (a) accept the staleness (the next sign-in mints a fresh JWT without the flag), (b) issue a synthetic short-lived JWT after password-set. Lean toward (a) — the flag's UX impact (forced-set redirect) is tolerable until the next request issues a fresh token via the session-refresh path; document the staleness window.
- **Revocation list cache misses.** F.6's 60s cache means a revoked user can still hit apps for up to 60s post-revocation. Mitigate by (a) making the TTL configurable; (b) for high-stakes routes (admin operations), bypass the cache with a direct list check. Out of scope for v1 — accept the 60s ceiling.
- **Key rotation.** Listed as out of scope above. The initial implementation pins one key. If a rotation is forced (key compromise), every JWT is invalidated; users re-auth. Acceptable for v1; tracked as a follow-up.
- **Public key distribution.** SDK consumers need portal's public key. Two options: (a) ship as env var (`PORTAL_JWT_PUBLIC_KEY`), (b) fetch from a discovery endpoint (`/.well-known/jwks.json`). (b) is more flexible (supports rotation later) but adds a startup-time round-trip. Implementation-time choice; lean (a) for v1.

## Confidence

**Medium-high.** The migration discipline (dual-path during the transition) is well-understood and mirrors how Better Auth was removed from heroes (Spec 02 Phase 2 ran the same pattern). The hard parts are (a) the revocation list's cache invalidation strategy and (b) the JWT payload's staleness for `passwordSetupRequired`. Both have proposed defaults; details resolve during implementation.

## References

- ADR 0005 — the original promise this spec delivers
- Spec 02 Phase 2 — T31's resolution, the deferred work this spec picks up
- Spec 06 PR F — session payload shape (`passwordSetupRequired`), revocation triggers (sign-out-everywhere)
- Integration contract §§ 1, 2 — auth ownership, identity model
- `apps/portal-api/src/services/sessions.ts:177` — current `validateSession` entry point
- `packages/heroes-shared/src/auth/user.ts:88` — current `loadHeroesAuthUser` entry point
- `apps/portal-api/src/middleware/auth.ts:106` — current portal-api middleware entry point
