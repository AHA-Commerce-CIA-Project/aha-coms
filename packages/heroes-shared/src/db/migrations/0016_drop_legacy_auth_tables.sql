-- Spec 02 Phase 2 / T36 — drop the three legacy auth tables.
--
-- Heroes' standalone-era auth flow used three tables for its own session
-- lifecycle: `session` (token + expiry, FK on heroes_profiles.id), `account`
-- (provider-token cache for the better-auth migration that never landed),
-- `verification` (better-auth holdover for email verification, also never
-- used). The Phase 2 cutover (T31–T34) moved every runtime auth read onto
-- portal's `__session` cookie + `/api/userinfo` introspection; T35 swept
-- the helpers that wrote those tables (`createLocalSessionForPortalUser`,
-- `destroyLocalSessionByToken`, `destroySessionsForPortalSub`, et al.) and
-- the SvelteKit routes that called them (`/auth/portal/exchange`,
-- `/auth/portal/logout`). Nothing reads or writes these rows anymore.
--
-- The legacy heroes login flow (better-auth, briefly considered, never
-- shipped to prod) populated `account` and `verification`; neither contains
-- audit data worth preserving. `session` rows accumulated under the Phase 1
-- redirect loop (8 in 30 minutes during T30 verification) and are equally
-- disposable — opaque tokens for sessions that never reached the browser
-- and that the new auth path cannot use.
--
-- Order: `session` and `account` both reference `heroes_profiles(id)` ON
-- DELETE CASCADE, so they have to go before any future schema change that
-- touches `heroes_profiles`; `verification` is standalone. DROP TABLE
-- cascades the indexes and FK constraints automatically.
--
-- Rollback procedure: restore from the pre-apply Cloud SQL automated
-- backup. No application code reads these tables; a rollback would only
-- exist to restore a separately-recoverable audit trail (none exists for
-- these rows).

DROP TABLE IF EXISTS "session";
DROP TABLE IF EXISTS "account";
DROP TABLE IF EXISTS "verification";
