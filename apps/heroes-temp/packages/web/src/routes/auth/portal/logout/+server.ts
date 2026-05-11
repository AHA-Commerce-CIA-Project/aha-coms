import { redirect } from '@sveltejs/kit'
import {
  PORTAL_SESSION_COOKIE,
  destroyLocalSessionByToken,
} from '@coms/shared/auth/session'
import { buildPortalSignInUrl } from '$lib/server/portal-broker'
import type { RequestHandler } from './$types'

// Local-only logout. Cross-origin portal cookie clearing isn't possible, and
// the portal has no SSO-logout endpoint today; the portal session outlives the
// heroes session until the user explicitly logs out of the portal itself.
const handler: RequestHandler = async ({ cookies }) => {
  const token = cookies.get(PORTAL_SESSION_COOKIE)
  if (token) await destroyLocalSessionByToken(token)
  cookies.delete(PORTAL_SESSION_COOKIE, { path: '/' })
  redirect(303, buildPortalSignInUrl())
}

export const GET: RequestHandler = handler
export const POST: RequestHandler = handler
