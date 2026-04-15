import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getAuth } from 'firebase-admin/auth'
import { initGip } from '../gip'

initGip()

export interface SessionUser {
  gipUid: string
  email: string
  name: string
  portalRole: string
  teamIds: string[]
  apps: string[]
}

/**
 * TanStack Start server function — verifies the __session cookie server-side
 * and returns the current user, or null if unauthenticated.
 *
 * Used in src/routes/_authed.tsx beforeLoad to guard all authenticated routes.
 */
export const getSessionFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SessionUser | null> => {
    const request = getRequest()
    const cookieHeader = request.headers.get('cookie') ?? ''
    const match = cookieHeader.match(/__session=([^;]+)/)
    const sessionCookie = match?.[1]

    if (!sessionCookie) return null

    try {
      const decoded = await getAuth().verifySessionCookie(sessionCookie, true)
      return {
        gipUid: decoded.uid,
        email: decoded.email ?? '',
        name: decoded.name ?? decoded.email ?? '',
        portalRole: (decoded['portalRole'] as string) ?? 'employee',
        teamIds: (decoded['teamIds'] as string[]) ?? [],
        apps: (decoded['apps'] as string[]) ?? [],
      }
    } catch {
      return null
    }
  },
)
