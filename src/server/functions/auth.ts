import { createServerFn } from '@tanstack/react-start'

export interface SessionUser {
  gipUid: string
  email: string
  name: string
  portalRole: string
  teamIds: string[]
  apps: string[]
}

export const getSessionFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SessionUser | null> => {
    const { getRequest } = await import('@tanstack/react-start/server')
    const { getAuth } = await import('firebase-admin/auth')
    const { initGip } = await import('../gip')

    initGip()

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
