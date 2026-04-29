/**
 * Centralized portal origin and CORS configuration.
 *
 * All portal URL references and CORS allowlist sourcing flows through this module
 * to ensure the eventual flip to coms.ahacommerce.net is configuration-only.
 */

/**
 * Portal origin — the authoritative base URL for broker tokens, JWKS discovery,
 * OIDC endpoints, and web-side admin links.
 *
 * Used by:
 *   - auth-broker.ts: PORTAL_BROKER_ISSUER claim in JWT
 *   - well-known.ts: issuer, jwks_uri, and discovery endpoints in OIDC doc
 *   - auth.ts: SELF_AUDIENCE for introspection endpoint
 *   - web admin/apps page: PORTAL_BROKER_ORIGIN for app launch links
 *
 * Env fallback: 'https://coms.ahacommerce.net' (current production domain)
 */
export const PORTAL_ORIGIN =
  process.env.PORTAL_PUBLIC_ORIGIN ?? 'https://coms.ahacommerce.net'

/**
 * Web app origin — used for CORS allowlist alongside PORTAL_ORIGIN.
 * On Cloud Run, this is the separate web service URL (e.g., https://web-*.run.app).
 * Env fallback: undefined (no web service URL in local dev; handled by CORS dev permissive mode).
 */
export const WEB_ORIGIN = process.env.WEB_ORIGIN

/**
 * CORS allowed origins — comma-separated list of origins that may fetch the API.
 *
 * In production, must be explicitly set; no fallback.
 * In development, CORS plugin provides permissive http://localhost:* to unblock local testing.
 *
 * Env format: 'https://web.example.com,https://portal.example.com'
 * Parsed into string[].
 */
export const CORS_ALLOWED_ORIGINS = (() => {
  const env = process.env.CORS_ALLOWED_ORIGINS
  if (!env) return []
  return env.split(',').map((origin) => origin.trim())
})()

/**
 * Session cookie domain — the domain attribute set on the portal's session cookie.
 * Undefined in development (defaults to current host). Must be set in production
 * to enable cross-subdomain session sharing if needed.
 *
 * Env fallback: undefined
 */
export const SESSION_COOKIE_DOMAIN = process.env.SESSION_COOKIE_DOMAIN
