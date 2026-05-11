/**
 * COMS Platform Auth Contracts
 *
 * Broker issuer naming:
 *   - Legacy (v1.1 and earlier): `'coms-portal-broker'` (bare string)
 *   - Current (v1.2+):           `'${PORTAL_ORIGIN}/broker'`
 *                                 e.g. `'https://coms.ahacommerce.net/broker'`
 *
 * During the Rev 2 dual-mode transition both issuers are accepted by the
 * portal verifier. The legacy bare-string value will be dropped on Day 30
 * of the migration (see spec-01 §"Migration Plan").
 *
 * PLATFORM_AUTH_CONTRACT_VERSION is surfaced in the OIDC discovery document
 * as `x-coms-platform-auth-contract-version` so relying parties can assert
 * the minimum contract level they require without parsing spec filenames.
 */

export const PLATFORM_AUTH_CONTRACT_VERSION = 2 as const
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

/**
 * Response shape returned by `createBrokerHandoff` (portal-side) and
 * consumed by relying-party apps when orchestrating a broker handoff.
 *
 * ## Token fields (dual-mode, Rev 2 §01)
 *
 * During the HS256 → ES256 migration both token siblings are emitted so
 * Heroes (and any future relying party) can pick whichever it supports:
 *
 * | Field        | Algorithm | Notes                                          |
 * |--------------|-----------|------------------------------------------------|
 * | `tokenHs256` | HS256     | Legacy symmetric token. Deprecated; Heroes     |
 * |              |           | will stop reading this after Day-30 cleanup.   |
 * | `tokenEs256` | ES256     | New asymmetric token. Verifiable via JWKS at   |
 * |              |           | `/.well-known/jwks.json`. Preferred path.      |
 * | `token`      | HS256     | **@deprecated** Back-compat alias for          |
 * |              |           | `tokenHs256`. Present until Heroes has fully   |
 * |              |           | migrated to ES256-only verification.           |
 *
 * The redirect URL carries the same siblings as query params:
 *   `portal_token` (HS256) and `portal_token_es256` (ES256).
 *
 * After the dual-mode period ends, `tokenHs256` and `token` will be
 * removed and only `tokenEs256` will remain.
 */
export interface PortalBrokerHandoffResponse {
  appSlug: string
  handoffMode: 'none' | 'one_time_code' | 'token_exchange'
  redirectUrl: string
  expiresAt?: string
  code?: string

  /**
   * HS256-signed broker token (legacy symmetric).
   * Present when `handoffMode === 'token_exchange'`.
   * @deprecated Use `tokenEs256` instead. Will be removed after Day-30 cleanup.
   */
  tokenHs256?: string

  /**
   * ES256-signed broker token (asymmetric, verifiable via JWKS).
   * Present when `handoffMode === 'token_exchange'` and an active signing key
   * has been bootstrapped in the portal. Will be `null` during a key-bootstrap
   * outage (graceful degradation — fall back to `tokenHs256`).
   */
  tokenEs256?: string | null

  /**
   * @deprecated Back-compat alias for `tokenHs256`. Heroes v1 reads this
   * field; keep it until Heroes ships ES256-only verification (Day 30).
   * After that, this field will be removed from the contract.
   */
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
