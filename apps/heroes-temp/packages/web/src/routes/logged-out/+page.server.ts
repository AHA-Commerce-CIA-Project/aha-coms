import {
  PORTAL_SESSION_COOKIE,
  destroyLocalSessionByToken,
} from '@coms/shared/auth/session'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ cookies }) => {
  const token = cookies.get(PORTAL_SESSION_COOKIE)
  if (token) await destroyLocalSessionByToken(token)
  cookies.delete(PORTAL_SESSION_COOKIE, { path: '/' })
  return {}
}
