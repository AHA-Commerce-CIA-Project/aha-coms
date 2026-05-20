import type { LayoutServerLoad } from './$types'

/**
 * NOTE — the in-process import of `@coms-portal/portal-api/services/launcher`
 * (PR #66, PR #67) crashed the Docker build at chunk-render time with a Bun
 * worker-thread error that didn't surface locally. Reverted to the prior
 * SSR `event.fetch` shape so deploys unblock. The original bug PR #66
 * intended to fix — empty AccountWidget switcher + missing ServiceBar tabs
 * at first paint — remains. The launcher service at
 * `apps/portal-api/src/services/launcher.ts` is kept as-is for a future
 * non-SSR fix (CSR or a dedicated portal-api endpoint hit with explicit
 * cookie forwarding).
 */
export const load: LayoutServerLoad = async ({ locals, fetch }) => {
  const userinfoRes = await fetch('/api/userinfo')
  const userinfo = userinfoRes.ok ? (await userinfoRes.json() as { apps?: { slug: string; label: string; url: string }[] }) : {}

  // Pre-load the ServiceBar's app list at SSR-time via SvelteKit's framework
  // `fetch` so the layout doesn't have to fire an eager client-side call on
  // mount — that pattern triggered SvelteKit's "avoid calling fetch eagerly
  // during SSR" warning and surfaced as proxy ECONNREFUSED errors in dev
  // during the HMR window when portal-api restarts. Best-effort: a failed
  // dashboard call yields an empty list rather than failing the whole render.
  let dashboardApps: { slug: string; name: string }[] = []
  try {
    const dashRes = await fetch('/api/v1/dashboard')
    if (dashRes.ok) {
      dashboardApps = (await dashRes.json()) as { slug: string; name: string }[]
    }
  } catch {
    // Transient — ServiceBar renders without the workspace tabs rather than
    // blocking the page. Same fallback shape as the failure path above.
  }

  return { user: locals.user, apps: userinfo.apps ?? [], dashboardApps }
}
