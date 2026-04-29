/**
 * Web-side portal configuration sourced from $env/dynamic/public.
 * Uses dynamic (runtime) imports so the portal origin flip does not require rebuild.
 */

import { env } from '$env/dynamic/public'

/**
 * Portal origin — the API's base URL for broker token exchange, JWKS, and introspection.
 * Sourced from PUBLIC_PORTAL_ORIGIN env var at runtime.
 * Fallback: 'https://coms.ahacommerce.net'
 */
export const PUBLIC_PORTAL_ORIGIN =
  env.PUBLIC_PORTAL_ORIGIN ?? 'https://coms.ahacommerce.net'
