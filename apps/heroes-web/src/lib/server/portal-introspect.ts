import { env } from '$env/dynamic/private'
import type { PortalSessionUser } from '@coms/shared/auth/session'
import { getOidcAuthHeader } from './google-oidc'

export type IntrospectResult =
  | { active: true; user: PortalSessionUser }
  | { active: false; revokedAt: string; reason: string }

export class PortalIntrospectUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PortalIntrospectUnavailableError'
  }
}

type CacheEntry = {
  result: IntrospectResult
  freshUntil: number   // now + 30s
  staleUntil: number   // now + 300s (5 min)
}

const cache = new Map<string, CacheEntry>()

const CACHE_TTL_MS = 30_000
const STALE_TTL_MS = 300_000  // 5 minutes
const RETRY_DELAYS_MS = [200, 600, 1200]

const STALE_SERVE_WINDOW_MS = 120_000 // 2 min
const STALE_SERVE_ERROR_THRESHOLD = 3
const staleServeTimestamps: number[] = []

function recordStaleServeAndDetermineSeverity(): 'WARNING' | 'ERROR' {
  const now = Date.now()
  // Drop entries outside the window before counting.
  while (staleServeTimestamps.length > 0 && staleServeTimestamps[0] < now - STALE_SERVE_WINDOW_MS) {
    staleServeTimestamps.shift()
  }
  staleServeTimestamps.push(now)
  return staleServeTimestamps.length >= STALE_SERVE_ERROR_THRESHOLD ? 'ERROR' : 'WARNING'
}

function requireEnv() {
  const origin = env.PORTAL_ORIGIN
  const appSlug = env.PORTAL_APP_SLUG
  if (!origin || !appSlug) {
    throw new Error('PORTAL_ORIGIN and PORTAL_APP_SLUG must be set')
  }
  return { origin, appSlug }
}

async function fetchIntrospect(args: {
  userId: string
  sessionIssuedAt: string
}): Promise<Response> {
  const { origin, appSlug } = requireEnv()

  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const oidcAuth = await getOidcAuthHeader(origin)
  if (oidcAuth) headers['authorization'] = oidcAuth

  return fetch(`${origin}/api/auth/broker/introspect`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId: args.userId, sessionIssuedAt: args.sessionIssuedAt, appSlug }),
  })
}

export async function introspectSession(args: {
  sessionId: string
  userId: string
  sessionIssuedAt: string
}): Promise<IntrospectResult> {
  const { sessionId, userId, sessionIssuedAt } = args

  const cached = cache.get(sessionId)
  if (cached) {
    if (cached.freshUntil > Date.now()) return cached.result
    if (cached.staleUntil <= Date.now()) cache.delete(sessionId)
  }

  let lastStatus = 0

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]))
    }

    let res: Response
    try {
      res = await fetchIntrospect({ userId, sessionIssuedAt })
    } catch {
      // network error — treat as 503
      lastStatus = 503
      continue
    }

    lastStatus = res.status

    if (res.status === 200) {
      const body = (await res.json()) as IntrospectResult
      const now = Date.now()
      cache.set(sessionId, {
        result: body,
        freshUntil: now + CACHE_TTL_MS,
        staleUntil: now + STALE_TTL_MS,
      })
      return body
    }

    if (res.status === 401) {
      console.error('[portal-introspect] 401 from portal — OIDC bearer token rejected')
      throw new Error(
        'Portal introspection auth rejected (401) — verify Heroes Cloud Run SA matches portal app_registry.service_account_email',
      )
    }

    if (res.status === 404) {
      return { active: false, revokedAt: new Date().toISOString(), reason: 'unknown_user' }
    }

    if (res.status === 503) {
      continue
    }

    // Unexpected status — don't retry
    throw new Error(`Portal introspection unexpected status ${res.status}`)
  }

  // Stale-while-revalidate: serve stale cache if portal is unreachable
  const stale = cache.get(sessionId)
  if (stale && stale.staleUntil > Date.now()) {
    const severity = recordStaleServeAndDetermineSeverity()
    console.log(JSON.stringify({
      severity,
      message: 'portal-introspect-stale-serve',
      lastStatus,
      sessionId,
      staleServeCountInWindow: staleServeTimestamps.length,
    }))
    return stale.result
  }

  console.log(JSON.stringify({
    severity: 'ERROR',
    message: 'portal-introspect-hard-fail',
    lastStatus,
    sessionId,
  }))
  throw new PortalIntrospectUnavailableError(
    `Portal introspection unavailable after retries (last status: ${lastStatus})`,
  )
}
