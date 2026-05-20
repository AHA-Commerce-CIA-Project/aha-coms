import type { LayoutServerLoad } from './$types'
import {
  getLauncherAppsForUser,
  getDashboardAppsForUser,
} from '@coms-portal/portal-api/services/launcher'

/**
 * Resolve the chrome's app data in-process — the SSR loopback through
 * Firebase Hosting (`event.fetch('/api/userinfo')` + `event.fetch('/api/v1/dashboard')`)
 * silently returned non-OK in prod, blanking the AccountWidget app
 * switcher and the ServiceBar tabs even though the user was authenticated
 * and could see the dashboard cards (the cards survive because they
 * fetch client-side via `dashboardQuery`).
 *
 * `locals.user` is already a fully-resolved `AuthUser` populated by
 * `hooks.server.ts` via the in-process `validateSession` helper — same
 * shape the portal-api routes used to re-resolve every call. The two
 * launcher queries hit `app_registry` directly so no HTTP, no cookie
 * forwarding, no cold-start latency.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
  const user = locals.user
  if (!user) {
    return { user: null, apps: [], dashboardApps: [] }
  }

  // Launcher is load-bearing for the chrome — let exceptions propagate to
  // SvelteKit's error boundary rather than silently rendering an
  // app-switcher with no apps.
  const launcherPromise = getLauncherAppsForUser(user)

  // The dashboard ServiceBar tabs tolerate a transient registry failure
  // best-effort — preserve the prior behaviour so a DB blip does not
  // blank the chrome.
  const dashboardPromise = getDashboardAppsForUser(user).catch(() => [])

  const [apps, dashboardApps] = await Promise.all([launcherPromise, dashboardPromise])
  return { user, apps, dashboardApps }
}
