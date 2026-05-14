import { GoogleAuth, type IdTokenClient } from 'google-auth-library'

/**
 * Outbound portal-api client. Mints Google ID tokens via the runtime
 * service account (`coms-fast-web-sa@...`) and presents them as
 * Bearer tokens; portal-api's `requireAppToken()` middleware
 * authenticates by matching the token's `email` claim against
 * `app_registry.service_account_email` for an `active` row.
 *
 * Mirrors apps/heroes-api/src/lib/portal-api-client.ts. Keeping the
 * pattern aligned across apps means token-minting / caching changes
 * happen in two places at once when they happen at all.
 */

export interface TaxonomySyncResponse {
  taxonomies: Array<{
    taxonomyId: string
    entries: Array<{
      key: string
      value: string
      metadata: Record<string, unknown> | null
    }>
  }>
  syncedAt: string
}

let cachedAuth: GoogleAuth | null = null
const idTokenClientCache = new Map<string, IdTokenClient>()

async function getIdTokenClient(audience: string): Promise<IdTokenClient> {
  let client = idTokenClientCache.get(audience)
  if (!client) {
    if (!cachedAuth) cachedAuth = new GoogleAuth()
    client = await cachedAuth.getIdTokenClient(audience)
    idTokenClientCache.set(audience, client)
  }
  return client
}

function getPortalBaseUrl(): string {
  const url = process.env.PORTAL_BASE_URL
  if (!url) throw new Error('PORTAL_BASE_URL is not set')
  return url
}

export async function fetchTaxonomySync(): Promise<TaxonomySyncResponse> {
  const portalUrl = getPortalBaseUrl()
  const client = await getIdTokenClient(portalUrl)
  const response = await client.request<TaxonomySyncResponse>({
    url: new URL('/api/taxonomies/sync', portalUrl).toString(),
    method: 'GET',
  })
  return response.data
}
