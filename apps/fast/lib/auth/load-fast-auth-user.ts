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

/**
 * Resolve the fast AuthUser for an incoming request.
 *
 * `portalSessionCookie` is the raw `__session` cookie value Firebase
 * Hosting forwarded into fast (read via `cookies().get('__session')`
 * in Next.js Server Components or Route Handlers). `portalOrigin` is
 * the single-origin host that fronts every consuming app —
 * `https://aha-coms.web.app` in prod, the dev origin locally.
 *
 * Returns `null` when the portal session is missing/invalid (401 from
 * userinfo) so callers can hand the request off to portal sign-in.
 * Throws `PortalSessionDeniedError` when the session is valid but the
 * user does not have the `fast` app slug — distinct from "not signed
 * in" so the layout can render a 403 instead of bouncing through the
 * sign-in handoff.
 */
export async function loadFastAuthUser(
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

  // Upsert the User row keyed on portal_sub. The first-time path
  // creates the row with a fresh local id (Prisma generates the
  // string id) so the 38 product-model FKs that reference `User.id`
  // continue to resolve. T64 collapses the local id and promotes
  // portal_sub to PK once every active user has a non-null value.
  const row = await prisma.user.upsert({
    where: { portal_sub: info.sub },
    create: {
      id: info.sub,
      portal_sub: info.sub,
      email: info.email,
      emailVerified: true,
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
      image: info.avatar_url,
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
