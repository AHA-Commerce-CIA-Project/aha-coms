import { redirect } from '@sveltejs/kit'
import { base } from '$app/paths'
import type { PageServerLoad } from './$types'

// FU-10: Portal-web mounts at /portal/ (svelte.config.js paths.base). The
// canonical landing for authed users is /portal/dashboard, mirroring heroes
// at /heroes/dashboard. The root /portal/ is a thin redirect that preserves
// the query string so handoff intents (?app=…&redirect_to=…) survive — the
// layout's onMount then reads them on /portal/dashboard and POSTs to the
// broker launch endpoint. Moving the dashboard out of the base root keeps
// the shared Sidebar's isActive logic working without coupling it to portal's
// specific base path.
export const load: PageServerLoad = async ({ url }) => {
  throw redirect(303, `${base}/dashboard${url.search}`)
}
