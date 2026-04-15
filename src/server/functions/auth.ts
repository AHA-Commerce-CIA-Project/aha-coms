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
    const { verifySessionCookie } = await import('../gip-admin')

    const request = getRequest()
    const cookieHeader = request.headers.get('cookie') ?? ''
    const match = cookieHeader.match(/__session=([^;]+)/)
    const sessionCookie = match?.[1]

    if (!sessionCookie) return null

    try {
      const decoded = await verifySessionCookie(sessionCookie)
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
