import { inArray } from 'drizzle-orm'
import { db } from '~/db'
import { appRegistry } from '~/db/schema'

/**
 * Launcher + dashboard data source.
 *
 * Both helpers used to live inline inside `routes/userinfo.ts` and
 * `routes/dashboard.ts`. They were lifted here so portal-web's `(authed)`
 * layout can call them in-process — the SSR loopback through Firebase
 * Hosting silently failed in prod, blanking the chrome's app switcher
 * and ServiceBar tabs. See `apps/portal-web/src/routes/(authed)/+layout.server.ts`.
 */

/** The slice of an authenticated user the launcher needs. */
export interface LauncherAuthUser {
  apps: string[]
}

export interface LauncherApp {
  slug: string
  label: string
  url: string
}

/**
 * Synthetic hub entry prepended to every user's launcher. Portal is the
 * suite hub every authenticated user reaches but does not live in
 * app_registry (portal owns the registry). The hub url points at the
 * canonical landing — FU-10 moved it from `/` to `/portal/dashboard`.
 *
 * Consuming apps used to hand-roll this prepend in their own layouts; the
 * T47 follow-up made this the canonical source so future apps inherit it
 * without each one having to remember to special-case the hub.
 */
const PORTAL_HUB_ENTRY: LauncherApp = {
  slug: 'portal',
  label: 'COMS',
  url: '/portal/dashboard',
}

/**
 * Returns the AccountWidget launcher list for an authenticated user — the
 * synthetic COMS hub followed by the apps the user has access to per the
 * `authUser.apps` claim. Filtered server-side against `app_registry`; the
 * widget only sees rows that the registry still recognises.
 */
export async function getLauncherAppsForUser(
  authUser: LauncherAuthUser,
): Promise<LauncherApp[]> {
  const launcher: LauncherApp[] = [{ ...PORTAL_HUB_ENTRY }]
  if (authUser.apps.length === 0) return launcher

  const rows = await db
    .select({
      slug: appRegistry.slug,
      name: appRegistry.name,
      url: appRegistry.url,
    })
    .from(appRegistry)
    .where(inArray(appRegistry.slug, authUser.apps))
  for (const r of rows) {
    launcher.push({ slug: r.slug, label: r.name, url: r.url })
  }
  return launcher
}

/**
 * Returns the full dashboard card shape for the user's apps. The shape
 * mirrors the response `GET /api/v1/dashboard` used to assemble inline —
 * keep it stable: the CSR consumer at
 * `apps/portal-web/src/lib/queries/dashboard.ts` and the AppCard
 * component reach for every field listed below.
 */
export async function getDashboardAppsForUser(authUser: LauncherAuthUser) {
  if (authUser.apps.length === 0) return []
  return db
    .select({
      id: appRegistry.id,
      slug: appRegistry.slug,
      name: appRegistry.name,
      description: appRegistry.description,
      url: appRegistry.url,
      iconUrl: appRegistry.iconUrl,
      status: appRegistry.status,
      healthStatus: appRegistry.healthStatus,
      lastHealthCheckAt: appRegistry.lastHealthCheckAt,
    })
    .from(appRegistry)
    .where(inArray(appRegistry.slug, authUser.apps))
}
