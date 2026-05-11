import { GoogleAuth } from 'google-auth-library'

// Single GoogleAuth instance for the whole package. The library caches
// IdTokenClients per-audience internally, so repeated calls to
// getIdTokenClient(audience) are cheap.
const auth = new GoogleAuth()

const warnedAudiences = new Set<string>()

/**
 * Mint a Google-signed ID token for the given audience and return it as
 * a fully-formed `Authorization: Bearer ...` header value.
 *
 * Returns `null` when no Application Default Credentials are available
 * or any other error occurs while minting the token. The caller is
 * expected to fall back to legacy auth (or unauthenticated calls during
 * dual-mode rollout). A single one-line warning is logged per audience
 * to avoid log spam in local dev without ADC.
 */
export async function getOidcAuthHeader(audience: string): Promise<string | null> {
  try {
    const client = await auth.getIdTokenClient(audience)
    const headers = await client.getRequestHeaders(audience)
    return headers.get('authorization')
  } catch (err) {
    if (!warnedAudiences.has(audience)) {
      warnedAudiences.add(audience)
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[google-oidc] no ID token for audience=${audience} (${msg}); continuing without OIDC`)
    }
    return null
  }
}
