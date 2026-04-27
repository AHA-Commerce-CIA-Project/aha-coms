/**
 * Well-known routes (Rev 2 §01 + §02).
 *
 * Mounted at the root `/api` level (not under `/v1`) so paths resolve as:
 *   GET /api/.well-known/jwks.json
 *   GET /api/.well-known/openid-configuration
 *
 * Both endpoints are unauthenticated and public — public keys and discovery
 * documents carry no sensitive information.
 */
import { Elysia } from 'elysia'
import { inArray } from 'drizzle-orm'
import { db } from '~/db'
import { portalBrokerSigningKeys } from '~/db/schema/signing-keys'
import { PLATFORM_AUTH_CONTRACT_VERSION } from '@coms-portal/shared/contracts/auth'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORTAL_ORIGIN = process.env.PORTAL_PUBLIC_ORIGIN ?? 'https://coms.ahacommerce.net'

const JWKS_CACHE_MAX_AGE_S = 600   // 10 min — short enough rotation propagates fast
const DISCOVERY_CACHE_S = 3600     // 1 hour — content rarely changes

// ---------------------------------------------------------------------------
// OIDC Discovery document — built once at module load (static relative to env)
// ---------------------------------------------------------------------------

const discoveryDocument = {
  issuer: `${PORTAL_ORIGIN}/broker`,
  jwks_uri: `${PORTAL_ORIGIN}/.well-known/jwks.json`,

  broker_launch_endpoint: `${PORTAL_ORIGIN}/api/auth/broker/launch/{appSlug}`,
  broker_exchange_endpoint: `${PORTAL_ORIGIN}/api/auth/broker/exchange`,
  introspection_endpoint: `${PORTAL_ORIGIN}/api/auth/broker/introspect`,

  id_token_signing_alg_values_supported: ['ES256'],
  introspection_endpoint_auth_methods_supported: ['google_oidc'],
  broker_exchange_auth_methods_supported: ['one_time_code'],

  response_types_supported: ['code'],
  subject_types_supported: ['public'],

  claims_supported: [
    'sub',
    'email',
    'name',
    'iss',
    'aud',
    'iat',
    'exp',
    'portal_role',
    'team_ids',
    'apps',
    'app_role',
    'branch',
  ],

  service_documentation:
    'https://github.com/mrdoorba/coms-portal/blob/main/docs/architecture/rev2/spec-01-rs256-jwks.md',

  'x-coms-platform-auth-contract-version': PLATFORM_AUTH_CONTRACT_VERSION,
  'x-coms-supported-app-transports': ['same_host_cookie', 'portable_token'],
  'x-coms-supported-handoff-modes': ['one_time_code', 'token_exchange'],
  'x-coms-webhook-events_supported': [
    'user.provisioned',
    'user.updated',
    'user.offboarded',
    'session.revoked',
  ],
} as const

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export const wellKnownRoutes = new Elysia({ prefix: '/.well-known' })

  /**
   * GET /.well-known/jwks.json
   *
   * Returns all public JWKs for `active` and `retiring` signing keys.
   * Consumers (e.g. Heroes) use this to verify ES256 broker tokens via
   * `jose`'s `createRemoteJWKSet`. Cache for 10 min; short enough that
   * rotation propagates within the key-grace window.
   */
  .get('/jwks.json', async ({ set }) => {
    const rows = await db
      .select({ publicJwk: portalBrokerSigningKeys.publicJwk })
      .from(portalBrokerSigningKeys)
      .where(inArray(portalBrokerSigningKeys.status, ['active', 'retiring']))

    set.headers['cache-control'] = `public, max-age=${JWKS_CACHE_MAX_AGE_S}, must-revalidate`
    set.headers['content-type'] = 'application/json'

    return { keys: rows.map((r) => r.publicJwk) }
  })

  /**
   * GET /.well-known/openid-configuration
   *
   * Static OIDC discovery document. Enables stock OIDC client libraries to
   * auto-discover the portal's JWKS URI, issuer, and supported claims by
   * pointing at `PORTAL_ORIGIN/.well-known/openid-configuration`.
   *
   * We are not fully OIDC-compliant — fields for unsupported flows
   * (authorization_endpoint, token_endpoint, PKCE, scopes) are deliberately
   * omitted, which OIDC clients correctly interpret as "not supported".
   */
  .get('/openid-configuration', ({ set }) => {
    set.headers['cache-control'] = `public, max-age=${DISCOVERY_CACHE_S}`
    set.headers['content-type'] = 'application/json'

    return discoveryDocument
  })
