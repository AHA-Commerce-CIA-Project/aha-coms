import { redirect } from '@sveltejs/kit'
import { buildPortalSignInUrl } from '$lib/server/portal-broker'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, url }) => {
  if (url.searchParams.has('portal_code')) {
    redirect(302, `/auth/portal/exchange${url.search}`)
  }
  redirect(302, locals.user ? '/dashboard' : buildPortalSignInUrl())
}
