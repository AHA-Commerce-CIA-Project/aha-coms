import { env } from '$env/dynamic/private'
import type { PortalSessionUser } from '@coms/shared/auth/session'
import { getOidcAuthHeader } from './google-oidc'

export type PortalBrokerExchangePayload = {
  appSlug: string
  brokeredAt: string
  expiresAt: string
  redirectTo: string | null
  sessionUser: PortalSessionUser
}

export class PortalBrokerError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'PortalBrokerError'
  }
}

function requireEnv() {
  const origin = env.PORTAL_ORIGIN
  const appSlug = env.PORTAL_APP_SLUG
  if (!origin || !appSlug) {
    throw new Error('PORTAL_ORIGIN and PORTAL_APP_SLUG must be set')
  }
  return { origin, appSlug }
}

function isPortalSessionUser(v: unknown): v is PortalSessionUser {
  if (!v || typeof v !== 'object') return false
  const u = v as Record<string, unknown>
  return (
    typeof u.id === 'string' &&
    typeof u.gipUid === 'string' &&
    typeof u.email === 'string' &&
    typeof u.name === 'string' &&
    typeof u.portalRole === 'string' &&
    Array.isArray(u.teamIds) &&
    Array.isArray(u.apps)
  )
}

function assertExchangePayload(data: unknown): PortalBrokerExchangePayload {
  if (!data || typeof data !== 'object') {
    throw new PortalBrokerError(502, 'Invalid exchange response: not an object')
  }
  const payload = data as Record<string, unknown>
  if (
    typeof payload.appSlug !== 'string' ||
    typeof payload.brokeredAt !== 'string' ||
    typeof payload.expiresAt !== 'string' ||
    !isPortalSessionUser(payload.sessionUser)
  ) {
    throw new PortalBrokerError(502, 'Invalid exchange response: missing required fields')
  }
  return {
    appSlug: payload.appSlug,
    brokeredAt: payload.brokeredAt,
    expiresAt: payload.expiresAt,
    redirectTo: typeof payload.redirectTo === 'string' ? payload.redirectTo : null,
    sessionUser: payload.sessionUser as PortalSessionUser,
  }
}

/**
 * Exchange a one-time portal_code for a verified session payload.
 *
 * The portal's /api/auth/broker/exchange endpoint verifies the code
 * server-side and returns the session user data as plain JSON over HTTPS.
 * No client-side JWT verification is needed.
 */
export async function exchangePortalCode(code: string): Promise<PortalBrokerExchangePayload> {
  const { origin, appSlug } = requireEnv()

  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const oidcAuth = await getOidcAuthHeader(origin)
  if (oidcAuth) headers['authorization'] = oidcAuth

  const res = await fetch(`${origin}/api/auth/broker/exchange`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ appSlug, code }),
  })

  if (!res.ok) {
    let message = `Portal broker exchange failed (${res.status})`
    try {
      const body = (await res.json()) as { message?: string }
      if (body?.message) message = body.message
    } catch {
      // non-JSON body; keep the default message
    }
    throw new PortalBrokerError(res.status, message)
  }

  return assertExchangePayload(await res.json())
}

export function buildPortalSignInUrl(redirectTo?: string): string {
  const { origin } = requireEnv()
  if (redirectTo) {
    return `${origin}/?app=heroes&redirect_to=${encodeURIComponent(redirectTo)}`
  }
  return `${origin}/`
}
