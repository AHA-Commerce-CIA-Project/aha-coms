import type { TaxonomyUpsertedPayload } from '@coms-portal/shared'
import { fetchTaxonomySync, type TaxonomySyncFetcher } from '../lib/portal-api-client'
import { handleTaxonomyUpserted } from './portal-events/handle-taxonomy-upserted'
import type { PortalEventHandler } from './portal-events/dispatch'

export interface PullTaxonomiesOnBootOptions {
  fetcher?: TaxonomySyncFetcher
  handler?: PortalEventHandler
}

export interface PullTaxonomiesOnBootResult {
  taxonomies: number
  entries: number
  error?: string
}

export async function pullTaxonomiesOnBoot(
  options: PullTaxonomiesOnBootOptions = {},
): Promise<PullTaxonomiesOnBootResult> {
  const fetcher = options.fetcher ?? fetchTaxonomySync
  const handler = options.handler ?? handleTaxonomyUpserted

  let response
  try {
    response = await fetcher()
  } catch (err) {
    const message = (err as Error).message
    console.warn(`[portal-bootstrap] taxonomy sync failed: ${message}`)
    return { taxonomies: 0, entries: 0, error: message }
  }

  let entryTotal = 0
  for (const tax of response.taxonomies) {
    if (tax.entries.length === 0) continue
    const payload: TaxonomyUpsertedPayload = {
      taxonomyId: tax.taxonomyId,
      entries: tax.entries,
    }
    await handler(payload)
    entryTotal += tax.entries.length
  }

  console.log(
    `[portal-bootstrap] cached ${entryTotal} entries across ${response.taxonomies.length} taxonomies`,
  )
  return { taxonomies: response.taxonomies.length, entries: entryTotal }
}
