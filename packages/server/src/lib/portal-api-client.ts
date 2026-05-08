import { GoogleAuth, type IdTokenClient } from 'google-auth-library'

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

export interface AliasResolveBatchInput {
  names: string[]
}

export interface AliasResolveBatchResponse {
  resolved: Array<{
    rawNameNormalized: string
    aliasId: string
    portalSub: string
    isPrimary: boolean
    tombstoned: boolean
    deactivatedAt: string | null
  }>
  unresolved: string[]
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

export async function resolveAliasesBatch(
  input: AliasResolveBatchInput,
): Promise<AliasResolveBatchResponse> {
  const portalUrl = getPortalBaseUrl()
  const client = await getIdTokenClient(portalUrl)
  const response = await client.request<AliasResolveBatchResponse>({
    url: new URL('/api/aliases/resolve-batch', portalUrl).toString(),
    method: 'POST',
    data: input,
    headers: { 'content-type': 'application/json' },
  })
  return response.data
}

export type TaxonomySyncFetcher = () => Promise<TaxonomySyncResponse>
