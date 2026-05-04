import { describe, expect, it } from 'bun:test'
import type { TaxonomyUpsertedPayload } from '@coms-portal/shared'
import { pullTaxonomiesOnBoot } from './portal-bootstrap'
import type { TaxonomySyncResponse } from '../lib/portal-api-client'

describe('pullTaxonomiesOnBoot', () => {
  it('dispatches one taxonomy.upserted handler invocation per taxonomy in the sync response', async () => {
    const handlerCalls: TaxonomyUpsertedPayload[] = []
    const stubHandler = async (payload: unknown) => {
      handlerCalls.push(payload as TaxonomyUpsertedPayload)
    }
    const stubFetcher = async (): Promise<TaxonomySyncResponse> => ({
      taxonomies: [
        {
          taxonomyId: 'branches',
          entries: [{ key: 'ID-JKT', value: 'Indonesia – Jakarta', metadata: null }],
        },
        {
          taxonomyId: 'teams',
          entries: [{ key: 'team-ops', value: 'Ops', metadata: null }],
        },
      ],
      syncedAt: '2026-05-04T12:00:00Z',
    })

    const result = await pullTaxonomiesOnBoot({ fetcher: stubFetcher, handler: stubHandler })

    expect(result).toEqual({ taxonomies: 2, entries: 2 })
    expect(handlerCalls).toHaveLength(2)
    expect(handlerCalls[0]).toEqual({
      taxonomyId: 'branches',
      entries: [{ key: 'ID-JKT', value: 'Indonesia – Jakarta', metadata: null }],
    })
    expect(handlerCalls[1]).toEqual({
      taxonomyId: 'teams',
      entries: [{ key: 'team-ops', value: 'Ops', metadata: null }],
    })
  })

  it('skips taxonomies with empty entries arrays without invoking the handler', async () => {
    const handlerCalls: TaxonomyUpsertedPayload[] = []
    const stubHandler = async (payload: unknown) => {
      handlerCalls.push(payload as TaxonomyUpsertedPayload)
    }
    const stubFetcher = async (): Promise<TaxonomySyncResponse> => ({
      taxonomies: [
        { taxonomyId: 'branches', entries: [] },
        {
          taxonomyId: 'teams',
          entries: [{ key: 't', value: 'T', metadata: null }],
        },
      ],
      syncedAt: '2026-05-04T12:00:00Z',
    })

    const result = await pullTaxonomiesOnBoot({ fetcher: stubFetcher, handler: stubHandler })

    expect(result).toEqual({ taxonomies: 2, entries: 1 })
    expect(handlerCalls).toHaveLength(1)
    expect(handlerCalls[0]?.taxonomyId).toBe('teams')
  })

  it('returns gracefully when the fetcher fails, without throwing (boot must not crash on portal outage)', async () => {
    const stubFetcher = async (): Promise<TaxonomySyncResponse> => {
      throw new Error('portal unreachable')
    }
    let handlerCalled = false
    const stubHandler = async () => {
      handlerCalled = true
    }

    const result = await pullTaxonomiesOnBoot({ fetcher: stubFetcher, handler: stubHandler })

    expect(result).toEqual({ taxonomies: 0, entries: 0, error: 'portal unreachable' })
    expect(handlerCalled).toBe(false)
  })
})
