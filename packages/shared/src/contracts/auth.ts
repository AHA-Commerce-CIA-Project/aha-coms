export const PLATFORM_AUTH_CONTRACT_VERSION = 1 as const
export const PORTAL_CLAIMS_VERSION = PLATFORM_AUTH_CONTRACT_VERSION

export const PORTAL_ROLES = ['employee', 'admin'] as const

export type PortalRole = (typeof PORTAL_ROLES)[number]

export const PORTAL_ROLE_LABELS: Record<PortalRole, string> = {
  employee: 'Employee',
  admin: 'Admin',
}

const PORTAL_ROLE_RANK: Record<PortalRole, number> = {
  employee: 0,
  admin: 1,
}

export const AUTH_TRANSPORT_MODES = ['same_host_cookie', 'portable_token'] as const

export type AuthTransportMode = (typeof AUTH_TRANSPORT_MODES)[number]

export const DEFAULT_AUTH_TRANSPORT_MODE: AuthTransportMode = 'portable_token'

export interface PortalClaims {
  claimsVersion: typeof PORTAL_CLAIMS_VERSION
  portalRole: PortalRole
  teamIds: string[]
  apps: string[]
  claimsUpdatedAt: number
}

export interface PortalSessionUser {
  id: string
  gipUid: string
  email: string
  name: string
  portalRole: PortalRole
  teamIds: string[]
  apps: string[]
}

export interface PortalBrokerExchangePayload {
  appSlug: string
  brokeredAt: string
  expiresAt: string
  redirectTo?: string | null
  sessionUser: PortalSessionUser
}

export interface PortalBrokerHandoffResponse {
  appSlug: string
  handoffMode: 'none' | 'one_time_code' | 'token_exchange'
  redirectUrl: string
  expiresAt?: string
  code?: string
  token?: string
}

export function isPortalRole(value: string): value is PortalRole {
  return PORTAL_ROLES.includes(value as PortalRole)
}

export function hasPortalRole(
  currentRole: PortalRole,
  requiredRoles: readonly PortalRole[],
): boolean {
  const currentRank = PORTAL_ROLE_RANK[currentRole]
  return requiredRoles.some((role) => currentRank >= PORTAL_ROLE_RANK[role])
}
