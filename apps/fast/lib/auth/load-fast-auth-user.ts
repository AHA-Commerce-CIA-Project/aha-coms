/**
 * loadFastAuthUser — the single auth-derivation function for fast
 * (Spec 05 Phase 3 / T60).
 *
 * Mirrors `packages/heroes-shared/src/auth/user.ts`'s shape — the
 * canonical pattern the integration contract enforces. Authored in
 * sub-phase (a) so it lives alongside Better Auth's `requireAuth()`
 * + `getServerSession()`; sub-phase (b) (T61) flips the ~127 call
 * sites to this helper; sub-phase (c) (T63/T64) deletes the Better
 * Auth surfaces and the Session/Account/Verification Prisma models.
 *
 * Why this shape exists:
 *   - Firebase Hosting filters every incoming cookie except `__session`
 *     before forwarding to Cloud Run. Better Auth's `better-auth.session`
 *     cookie won't survive the single-origin world (T65 mounts fast at
 *     `/fast/`); the portal `__session` cookie is the only one Hosting
 *     forwards.
 *   - The portal `__session` cookie value is an opaque UUID
 *     (`auth_sessions.id`), not a JWT. Introspection happens via
 *     `GET /api/userinfo` on portal-api — identical primitive heroes
 *     uses; the only difference is the apps-claim slug check.
 *   - Upsert keyed on `portal_sub` (added by the T60 migration as a
 *     nullable + unique column) so the row maps the portal identity
 *     to fast's local `User`. Once T64 promotes `portal_sub` to the
 *     PK and drops `User.id`/`emailVerified`, this helper does not
 *     change shape — only the upsert target column does.
 *
 * Per-request cost: one HTTP fetch to portal-api + one Prisma upsert
 * against `User`. No additional joins (fast's `User` row carries all
 * fast-side identity in-line — `role`, `teamId`, `image` — so there's
 * no `fast_profiles` second-table read).
 */
import { cache } from 'react'
import { prisma } from '@/lib/db'

/**
 * Shape of the response from portal-api's `GET /api/userinfo`. Mirrors
 * `apps/portal-api/src/routes/userinfo.ts` — kept in sync by hand; the
 * SDK does not yet wrap this route.
 */
export type PortalUserInfoResponse = {
  sub: string
  name: string
  email: string
  emails: Array<{
    emailId: string
    address: string
    kind: 'workspace' | 'personal'
    isPrimary: boolean
    verified: boolean
    addedBy: string
  }>
  portalRole: string
  avatar_url: string | null
  apps: Array<{ slug: string; label: string; url: string }>
}

export class PortalSessionDeniedError extends Error {
  constructor(public readonly portalSub: string) {
    super(`No fast access for ${portalSub}`)
    this.name = 'PortalSessionDeniedError'
  }
}

/**
 * Resolved fast AuthUser. Carries the fields ~127 `requireFastAuth()` call
 * sites read today — `id`, `email`, `name`, `role`, `teamId`, `image`
 * — plus the portal-side claims (`portalRole`, `apps`) so RBAC-shaped
 * surfaces no longer need to round-trip to `/api/profile` or any
 * companion endpoint to learn what the caller is allowed to do.
 */
export type AuthUser = {
  id: string
  portalSub: string
  email: string
  name: string
  image: string | null
  role: string
  teamId: string | null
  portalRole: string
  apps: readonly string[]
}

export type FastAuthResult = {
  user: AuthUser
  appCatalog: readonly { slug: string; label: string; url: string }[]
}

type SessionCacheEntry = { result: FastAuthResult; expiresAt: number }
const sessionResultCache = new Map<string, SessionCacheEntry>()
const SESSION_CACHE_TTL_MS = 5 * 60 * 1000
const SESSION_CACHE_MAX_ENTRIES = 5000

export function __resetAuthCacheForTests(): void {
  sessionResultCache.clear()
}

/**
 * Drop one entry from the in-memory session result cache.
 *
 * Called by mutation endpoints (e.g. POST /api/profile/avatar) that
 * change a field carried by FastAuthResult — name, image, role, etc.
 * Without invalidation the next requireFastAuth() call on the same
 * cookie returns the pre-mutation snapshot for up to 5 minutes,
 * making freshly-uploaded avatars appear to revert in the header /
 * sidebar until the TTL lapses.
 *
 * No-op when the cookie isn't currently cached; safe to call
 * unconditionally from the mutation path.
 */
export function invalidateFastAuthCache(portalSessionCookie: string): void {
  sessionResultCache.delete(portalSessionCookie)
}

async function resolveFastAuthUserFresh(
  portalSessionCookie: string,
  portalOrigin: string,
): Promise<FastAuthResult | null> {
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
  if (!appsList.includes('fast')) {
    throw new PortalSessionDeniedError(info.sub)
  }

  const row = await prisma.user.upsert({
    where: { portal_sub: info.sub },
    create: {
      id: info.sub,
      portal_sub: info.sub,
      email: info.email,
      name: info.name,
      image: info.avatar_url,
      role: 'member',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      portal_sub: info.sub,
      email: info.email,
      name: info.name,
      // image is intentionally NOT updated on subsequent sign-ins.
      // The portal-supplied avatar seeds the row at create time;
      // after that, fast owns user.image — the only writer is the
      // POST /api/profile/avatar endpoint. Without this carve-out
      // a user's custom avatar gets clobbered by the portal's
      // value every time the 5-min session cache misses + this
      // upsert runs. Re-syncing from portal when the user has
      // never customized would be nicer, but distinguishing
      // "portal-default" from "user-customized" without an extra
      // column is fragile — leaving image alone is the boring
      // correct option.
      updatedAt: new Date(),
    },
  })

  return {
    user: {
      id: row.id,
      portalSub: info.sub,
      email: row.email,
      name: row.name,
      image: row.image,
      role: row.role,
      teamId: row.teamId,
      portalRole: info.portalRole,
      apps: appsList,
    },
    appCatalog: info.apps,
  }
}

/**
 * Resolve the fast AuthUser for an incoming request.
 *
 * Two layers of memoization sit in front of the portal-api fetch +
 * Prisma upsert:
 *   1. React `cache()` coalesces calls inside one server render
 *      (Server Components that all call requireFastAuth share one
 *      result).
 *   2. A module-level Map keyed on the `__session` cookie with a
 *      5-minute TTL coalesces calls across requests on the same Cloud
 *      Run instance. session_affinity routes a given client's repeat
 *      requests to the same instance, so the hit rate is high.
 *
 * Only successful results are cached. 401 (revoked / expired session)
 * and PortalSessionDeniedError (no `fast` claim) re-check on every
 * call so revocation propagates immediately.
 */
export const loadFastAuthUser = cache(
  async (
    portalSessionCookie: string,
    portalOrigin: string,
  ): Promise<FastAuthResult | null> => {
    const cached = sessionResultCache.get(portalSessionCookie)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result
    }
    const result = await resolveFastAuthUserFresh(portalSessionCookie, portalOrigin)
    if (result) {
      if (sessionResultCache.size >= SESSION_CACHE_MAX_ENTRIES) {
        const oldest = sessionResultCache.keys().next().value
        if (oldest !== undefined) sessionResultCache.delete(oldest)
      }
      sessionResultCache.set(portalSessionCookie, {
        result,
        expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
      })
    }
    return result
  },
)
