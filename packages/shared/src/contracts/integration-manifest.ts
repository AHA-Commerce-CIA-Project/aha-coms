import {
  DEFAULT_AUTH_TRANSPORT_MODE,
  PLATFORM_AUTH_CONTRACT_VERSION,
  type AuthTransportMode,
} from './auth'

export const PORTAL_INTEGRATION_MANIFEST_VERSION = 1 as const
export const PORTAL_INTEGRATION_MANIFEST_FILE = 'portal.integration.json'

export const PORTAL_ADAPTER_TYPES = [
  'server_middleware',
  'edge_proxy',
  'gateway_bridge',
  'frontend_shell',
] as const

export type PortalAdapterType = (typeof PORTAL_ADAPTER_TYPES)[number]

export const PROTECTED_ROUTE_MODES = ['app_wide', 'allowlist', 'denylist', 'hybrid'] as const

export type ProtectedRouteMode = (typeof PROTECTED_ROUTE_MODES)[number]

export const PORTAL_COMPLIANCE_STATUSES = [
  'draft',
  'planned',
  'dual_run',
  'compliant',
  'exception',
  'deprecated',
] as const

export type PortalComplianceStatus = (typeof PORTAL_COMPLIANCE_STATUSES)[number]

export const PORTAL_HANDOFF_MODES = ['none', 'one_time_code', 'token_exchange'] as const

export type PortalHandoffMode = (typeof PORTAL_HANDOFF_MODES)[number]

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

export type HttpMethod = (typeof HTTP_METHODS)[number]

export const AUTH_ENTRYPOINT_KINDS = [
  'login',
  'logout',
  'callback',
  'session_probe',
  'session_introspection',
  'token_exchange',
  'refresh',
  'lifecycle_webhook',
] as const

export type AuthEntrypointKind = (typeof AUTH_ENTRYPOINT_KINDS)[number]

export interface PortalRuntimeDescriptor {
  stack: string
  framework?: string
  language?: string
  packageManager?: string
}

export interface PortalRoutePattern {
  pattern: string
  kind?: 'exact' | 'prefix' | 'glob'
}

export interface PortalAuthEntrypoint {
  kind: AuthEntrypointKind
  path: string
  method?: HttpMethod
  description?: string
}

export interface PortalEnvRequirement {
  name: string
  required: boolean
  secret?: boolean
  description?: string
}

export interface PortalAdapterContract {
  type: PortalAdapterType
  transport: AuthTransportMode
  handoffMode: PortalHandoffMode
  protectedRouteMode: ProtectedRouteMode
  modulePath?: string
  sessionCookieName?: string
  audience?: string
  brokerOrigin?: string
}

export interface PortalComplianceMetadata {
  status: PortalComplianceStatus
  contractVersion: number
  notes?: string[]
  blockerCategories?: string[]
  lastVerifiedAt?: string | null
}

/**
 * Declares that the relying-party app exposes a webhook receiver for portal
 * lifecycle events (session.revoked, user.provisioned, user.updated,
 * user.offboarded). The portal admin registers the concrete URL + HMAC secret
 * via the portal admin UI; this manifest field only documents the receiver's
 * capability surface.
 */
export interface PortalLifecycleWebhookContract {
  receiverPath: string
  subscribedEvents: string[]
  signatureHeader?: string
  description?: string
}

export interface PortalAppRole {
  /** Machine key — stored in portal DB, sent in webhooks. e.g. 'leader' */
  key: string
  /** Human label for the portal admin UI. e.g. 'Team Leader' */
  label: string
  /** If true, this role is assigned when no explicit role is selected */
  default?: boolean
  /** Optional description shown in the portal admin UI */
  description?: string
}

export interface PortalIntegrationManifest {
  manifestVersion: typeof PORTAL_INTEGRATION_MANIFEST_VERSION
  appSlug: string
  appName: string
  runtime: PortalRuntimeDescriptor
  adapter: PortalAdapterContract
  authEntrypoints: PortalAuthEntrypoint[]
  protectedRoutes: PortalRoutePattern[]
  requiredEnv: PortalEnvRequirement[]
  compliance: PortalComplianceMetadata
  lifecycleWebhooks?: PortalLifecycleWebhookContract
  /** App-local roles. The portal does not enforce these — it stores and
   *  forwards them. The app owns interpretation and fine-grained permissions. */
  appRoles?: PortalAppRole[]
}

export function createPortalIntegrationManifest(
  input: Omit<
    PortalIntegrationManifest,
    'manifestVersion' | 'compliance'
  > & {
    adapter: Omit<PortalAdapterContract, 'transport'> & {
      transport?: AuthTransportMode
    }
    compliance?: Partial<PortalComplianceMetadata>
  },
): PortalIntegrationManifest {
  const adapterTransport = input.adapter.transport ?? DEFAULT_AUTH_TRANSPORT_MODE
  const adapterHandoffMode =
    input.adapter.handoffMode ?? (adapterTransport === 'same_host_cookie' ? 'none' : 'one_time_code')

  return {
    manifestVersion: PORTAL_INTEGRATION_MANIFEST_VERSION,
    ...input,
    compliance: {
      status: 'draft',
      contractVersion: PLATFORM_AUTH_CONTRACT_VERSION,
      ...input.compliance,
    },
    adapter: {
      ...input.adapter,
      transport: adapterTransport,
      handoffMode: adapterHandoffMode,
    },
  }
}

export function isPortalAdapterType(value: string): value is PortalAdapterType {
  return PORTAL_ADAPTER_TYPES.includes(value as PortalAdapterType)
}

export function isProtectedRouteMode(value: string): value is ProtectedRouteMode {
  return PROTECTED_ROUTE_MODES.includes(value as ProtectedRouteMode)
}

export function isPortalComplianceStatus(value: string): value is PortalComplianceStatus {
  return PORTAL_COMPLIANCE_STATUSES.includes(value as PortalComplianceStatus)
}

export function isPortalHandoffMode(value: string): value is PortalHandoffMode {
  return PORTAL_HANDOFF_MODES.includes(value as PortalHandoffMode)
}

export function validatePortalIntegrationManifest(manifest: PortalIntegrationManifest): string[] {
  const errors: string[] = []

  if (!manifest.appSlug.trim()) errors.push('appSlug is required')
  if (!manifest.appName.trim()) errors.push('appName is required')
  if (!manifest.runtime.stack.trim()) errors.push('runtime.stack is required')
  if (!isPortalAdapterType(manifest.adapter.type)) errors.push('adapter.type is invalid')
  if (!isProtectedRouteMode(manifest.adapter.protectedRouteMode)) {
    errors.push('adapter.protectedRouteMode is invalid')
  }
  if (!isPortalHandoffMode(manifest.adapter.handoffMode)) {
    errors.push('adapter.handoffMode is invalid')
  }
  if (!manifest.authEntrypoints.length) errors.push('at least one authEntrypoint is required')
  if (!manifest.protectedRoutes.length) errors.push('at least one protectedRoute is required')
  if (!isPortalComplianceStatus(manifest.compliance.status)) {
    errors.push('compliance.status is invalid')
  }
  if (manifest.compliance.contractVersion <= 0) {
    errors.push('compliance.contractVersion must be positive')
  }
  if (
    manifest.adapter.transport === 'same_host_cookie' &&
    !manifest.adapter.sessionCookieName?.trim()
  ) {
    errors.push('adapter.sessionCookieName is required for same_host_cookie transport')
  }
  if (
    manifest.adapter.transport === 'same_host_cookie' &&
    manifest.adapter.handoffMode !== 'none'
  ) {
    errors.push('adapter.handoffMode must be none for same_host_cookie transport')
  }
  if (
    manifest.adapter.transport === 'portable_token' &&
    !manifest.adapter.audience?.trim()
  ) {
    errors.push('adapter.audience is required for portable_token transport')
  }
  if (
    manifest.adapter.transport === 'portable_token' &&
    !manifest.adapter.brokerOrigin?.trim()
  ) {
    errors.push('adapter.brokerOrigin is required for portable_token transport')
  }
  if (
    manifest.adapter.transport === 'portable_token' &&
    manifest.adapter.handoffMode === 'none'
  ) {
    errors.push('adapter.handoffMode must not be none for portable_token transport')
  }

  return errors
}
