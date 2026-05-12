/**
 * loadHeroesAuthUser — the single auth-derivation function for heroes
 * (Spec 02 Phase 2 / T32).
 *
 * Replaces the local `getLocalSessionByToken` + heroes_profiles join the
 * `(authed)/+layout.server.ts` and heroes-api auth middleware used to thread
 * through. The new contract is: portal owns the session, heroes introspects
 * it via `GET /api/userinfo`, then upserts its own row in `heroes_profiles`
 * for any heroes-specific fields (branch, team, role, canSubmitPoints).
 *
 * Why this shape exists:
 *   - Firebase Hosting filters every incoming cookie except `__session`
 *     before forwarding to Cloud Run (documented at firebase.google.com/docs/
 *     hosting/manage-cache). Heroes' previous `coms_session` cookie never
 *     reached heroes-web in the single-origin world (T30 wall).
 *   - Portal's `__session` cookie value is an opaque UUID — `auth_sessions.id`
 *     — not a JWT. SDK-side JWT verification (the original Phase 2 sketch)
 *     does not apply. The introspection primitive is the `/api/userinfo`
 *     route on portal-api, which validates the cookie server-side and
 *     returns `{ sub, name, email, portalRole, apps, … }`.
 *   - The fetch goes through `https://aha-coms.web.app/api/userinfo` so
 *     Firebase Hosting's `/api/**` rewrite forwards to coms-portal-api with
 *     the `__session` cookie attached. Hitting portal-api's `*.run.app` URL
 *     directly would skip Firebase's allowlist but bypasses single-origin.
 *
 * Per-request cost: one HTTP fetch to portal-api + one heroes_profiles
 * upsert + one heroes_profiles read + one opportunistic email_cache
 * upsert. The cache JOIN against user_config_cache that Phase 5's
 * audit (T44) found dead-weight retired in T45 — can_submit_points now
 * lives on heroes_profiles directly, so the auth-path read touches a
 * single table.
 */
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { emailCache, heroesProfiles } from '../db/schema'
import type { AuthUser } from '../types'
import type { UserRole } from '../constants/roles'

/**
 * Shape of the response from portal-api's `GET /api/userinfo`. Mirrors the
 * route's response schema at `apps/portal-api/src/routes/userinfo.ts:90`.
 * Kept in sync by hand; the schema is also encoded in the portal-api Elysia
 * route's typebox definition (the SDK does not yet wrap it).
 */
export type PortalUserInfoResponse = {
  sub: string
  name: string
  email: string
  portalRole: string
  apps: Array<{ slug: string; label: string; url: string }>
}

export class PortalSessionDeniedError extends Error {
  constructor(public readonly portalSub: string) {
    super(`No heroes access for ${portalSub}`)
    this.name = 'PortalSessionDeniedError'
  }
}

/**
 * Result of `loadHeroesAuthUser`: the resolved heroes AuthUser plus the
 * rich app catalog returned by `/api/userinfo`. The catalog carries the
 * `{slug, label, url}` triples portal-api joined out of `app_registry`
 * for the user's apps claim — heroes' chrome derives the ServiceBar and
 * AccountWidget launcher from it directly (Spec 02 Phase 4 / T40), so
 * apps no longer hand-roll the slug → label/url mapping client-side.
 */
export type HeroesAuthResult = {
  user: AuthUser
  appCatalog: readonly { slug: string; label: string; url: string }[]
}

/**
 * Resolve the heroes AuthUser for an incoming request.
 *
 * `portalSessionCookie` is the raw `__session` cookie value Firebase
 * Hosting forwarded into heroes-web (or heroes-api). `portalOrigin` is
 * the single-origin host that fronts both heroes-web and portal-api —
 * `https://aha-coms.web.app` in prod, the dev origin locally.
 *
 * Returns `null` when the portal session is missing/invalid (401 from
 * userinfo) so callers can hand the request off to portal sign-in.
 * Throws `PortalSessionDeniedError` when the session is valid but the
 * user does not have the `heroes` app — distinct from "not signed in"
 * so the layout can render a 403 instead of bouncing through the
 * sign-in handoff.
 */
export async function loadHeroesAuthUser(
  portalSessionCookie: string,
  portalOrigin: string,
): Promise<HeroesAuthResult | null> {
  const res = await fetch(`${portalOrigin}/api/userinfo`, {
    method: 'GET',
    headers: { cookie: `__session=${portalSessionCookie}` },
  })

  if (res.status === 401) return null
  if (!res.ok) {
    throw new Error(`userinfo call failed: ${res.status} ${res.statusText}`)
  }

  const info = (await res.json()) as PortalUserInfoResponse
  const appsList = info.apps.map((a) => a.slug)
  if (!appsList.includes('heroes')) {
    throw new PortalSessionDeniedError(info.sub)
  }
  const appCatalog = info.apps

  // Upsert the heroes_profiles row so heroes-side joins (branch, team, role)
  // always see a row keyed on portal sub. Idempotent; collapses to a no-op
  // when the row already exists and name has not drifted.
  await db
    .insert(heroesProfiles)
    .values({ id: info.sub, name: info.name, isActive: true })
    .onConflictDoUpdate({
      target: heroesProfiles.id,
      set: { name: info.name, isActive: true, updatedAt: new Date() },
    })

  // Refresh email_cache opportunistically so heroes-side surfaces (audit
  // log, leaderboard) can show the user's contact email without a
  // per-request portal round-trip. Soft-fail: if portal returned no email
  // (impossible today but defensive) we skip the upsert.
  if (info.email) {
    await db
      .insert(emailCache)
      .values({ portalSub: info.sub, contactEmail: info.email })
      .onConflictDoUpdate({
        target: emailCache.portalSub,
        set: { contactEmail: info.email, cachedAt: new Date() },
      })
  }

  const [row] = await db
    .select({
      id: heroesProfiles.id,
      name: heroesProfiles.name,
      role: heroesProfiles.role,
      canSubmitPoints: heroesProfiles.canSubmitPoints,
      branchKey: heroesProfiles.branchKey,
      branchValueSnapshot: heroesProfiles.branchValueSnapshot,
      teamKey: heroesProfiles.teamKey,
      teamValueSnapshot: heroesProfiles.teamValueSnapshot,
    })
    .from(heroesProfiles)
    .where(eq(heroesProfiles.id, info.sub))
    .limit(1)

  if (!row) {
    // Race or programming error — the insert above just landed.
    throw new Error(`heroes_profiles row missing after upsert for sub=${info.sub}`)
  }

  return {
    user: {
      id: row.id,
      email: info.email,
      name: row.name,
      role: row.role as UserRole,
      branchKey: row.branchKey ?? null,
      branchValueSnapshot: row.branchValueSnapshot ?? null,
      teamKey: row.teamKey ?? null,
      teamValueSnapshot: row.teamValueSnapshot ?? null,
      canSubmitPoints: row.canSubmitPoints,
      portalRole: info.portalRole,
      apps: appsList,
    },
    appCatalog,
  }
}
