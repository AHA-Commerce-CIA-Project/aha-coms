export const PORTAL_ROLES = ['admin', 'employee'] as const

export type PortalRole = (typeof PORTAL_ROLES)[number]

export interface PortalClaims {
  portalRole: PortalRole
  teamIds: string[]
  apps: string[]
  claimsUpdatedAt: number
}

export const SESSION_COOKIE_NAME = '__session'

export const SESSION_COOKIE_OPTIONS = {
  name: SESSION_COOKIE_NAME,
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 14, // 14 days
}
