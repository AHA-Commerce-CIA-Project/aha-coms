import {
  PORTAL_SESSION_COOKIE,
  destroyLocalSessionByToken,
} from '@coms-portal/heroes-shared/auth/session'
import type { PageServerLoad } from './$types'

// `cache-control: private, no-store` is mandatory here — Firebase Hosting
// strips Set-Cookie (including the Max-Age=0 deletion) from any cacheable
// response. Without this header the cookie would survive the logged-out
// page render. Same trap as /auth/portal/exchange and /auth/portal/logout.
export const load: PageServerLoad = async ({ cookies, setHeaders }) => {
  setHeaders({ 'cache-control': 'private, no-store' })
  const token = cookies.get(PORTAL_SESSION_COOKIE)
  if (token) await destroyLocalSessionByToken(token)
  cookies.delete(PORTAL_SESSION_COOKIE, { path: '/' })
  return {}
}
