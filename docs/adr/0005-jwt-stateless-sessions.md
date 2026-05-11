# ADR 0005: Stateless JWT sessions

Status: accepted (2026-05-11)

## Context

Heroes currently maintains a Better-Auth-shaped session store: `session`, `account`, and `verification` tables in `packages/shared/src/db/schema/auth.ts`. The schema is legacy from when heroes ran Better Auth as a credential provider. Today, heroes accepts portal-minted sessions via the `/auth/portal/exchange` flow and stores the resulting session as a row in `session` with extra columns `portalRole` and `apps` bolted on.

Three problems with the current state:

1. **Dead-code tables.** `account` and `verification` are never written to — heroes doesn't host credentials anymore. They exist because the original Better-Auth migration introduced them. They confuse new readers and clutter the schema.

2. **Snapshot staleness.** The `session` row's `portalRole` and `apps` fields are snapshotted at session creation. If portal grants the user access to a new app on Monday, heroes won't see it until session expiry (7 days default). The user opens heroes' app switcher and the new app is missing. This is a real UX bug.

3. **Two-step lookup.** Every authenticated request: cookie → token → session row → user-profile JOIN. Two DB roundtrips minimum, three tables in the second query. Fast enough today, but cumulative across the suite it adds up — and the design forces every app to maintain its own session store.

The portal already mints sessions. Other apps could verify those sessions directly via the SDK, without storing anything app-side. This is the stateless JWT path.

## Decision

Sessions are stateless JWTs minted by the portal, verified by apps via `@coms-portal/sdk`. No app-local session table.

The JWT payload includes:

- `sub` — the portal user UUID
- `apps` — list of app slugs the user has access to
- `portalRole` — the user's role at the portal level
- `email` — contact email (small, frequently needed)
- `iat`, `exp` — standard timing claims
- `iss` — portal as the issuer
- Possibly a short-lived ID with a longer-lived refresh token for revocation responsiveness

Apps verify the JWT on every authenticated request. Apps maintain an `<app>_profiles` table for app-specific data (preferences, app-internal role, denormalized snapshots), keyed on the portal user UUID. They do NOT maintain a session table.

Token lifetime is a portal-level decision. The recommended pattern: short access tokens (15-30 minutes) with a refresh token mechanism for prolonged sessions. The exact policy is documented separately and may evolve; apps inherit whatever portal sets.

## Consequences

**Positive.**

- Zero app-side session storage. Three tables removed from each app's schema (`session`, `account`, `verification`).
- Zero DB roundtrips for session validation. App profile is loaded after auth as a separate, smaller query.
- No staleness for in-token data. Every JWT carries fresh portal state at issue time.
- Clean ownership separation: portal owns identity state; apps own app-specific profile state.
- App-internal logic that checks "does this user have access to fast" is a plain claim check, not a DB join.

**Negative.**

- Revocation isn't immediate. A revoked app-access grant takes effect when the token expires or the user re-authenticates (whichever first). Mitigations available: short token lifetime + refresh tokens; or a portal-side "revoked subjects" denylist that apps check via SDK on each request (defeats the stateless benefit but stays cheaper than full session tables).
- JWT size grows with claims. At our scale this is not material — modern JWTs at ~1KB sail well below cookie size limits and HTTP header limits.
- Apps cannot independently "log a user out" — logout is portal-initiated and propagates via short token lifetimes (or active revocation list, if implemented).

**Neutral.**

- Token signing/verification uses RS256 with the portal's published JWKS, already established in the codebase (see `coms_portal/apps/api/src/middleware/auth.ts`). No new crypto infrastructure.
- App profile load is unchanged — same query whether session was JWT or DB row.

## Alternatives considered

**Local session tables with portal-pushed refresh on grant changes.** Apps maintain session storage; portal pushes webhooks when grants change so apps update their session rows. Lower latency for revocation. Rejected because:

- Every app maintains its own session store. Schema duplication across apps.
- The two-step lookup persists.
- A missed webhook leaves drifted state. Recovery requires a reconciliation script.
- The original Better-Auth tables in heroes are exactly this pattern. The drift problem is empirically real.

**Hybrid: short-lived JWT + revocation list.** Keep JWTs stateless for the common case; consult a portal-managed "revoked sub" list on each request via SDK. Most secure, but operational complexity and our threat model doesn't justify it yet. Re-evaluate if app-access revocation responsiveness becomes a real requirement.

**Status quo (Better-Auth-shaped local sessions).** Tolerates dead-code tables and the staleness bug. Heroes already proves this works at the cost of the issues above. Doesn't meet the cleanup bar.

## Migration impact for heroes

- Drop `session`, `account`, `verification` tables (write a migration that drops them after confirming zero reads).
- Replace `getLocalSessionByToken` with `@coms-portal/sdk` JWT verification.
- Delete `/auth/portal/exchange` route's session-minting half; redirect-handoff for first-login may remain (TBD by single-origin migration in ADR 0003).
- `hooks.server.ts` and `server/src/middleware/auth.ts` collapse to: verify JWT → look up `heroes_profiles` row → done.
- Remove `portalRole` and `apps` denormalization from any local table.

## References

- Integration contract §§ 1, 2.
- ADR 0006 (GIP-only auth) — defines the credential source whose tokens this ADR verifies.
- Heroes' `packages/shared/src/auth/session.ts` and `packages/shared/src/db/schema/auth.ts` — the patterns this ADR replaces.
