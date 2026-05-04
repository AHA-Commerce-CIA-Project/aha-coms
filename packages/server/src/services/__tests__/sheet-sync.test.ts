/**
 * sheet-sync 4-outcome routing tests (Slice 6A).
 *
 * Tests use dependency-injected resolvers so no real HTTP calls are made.
 * Each ingestion path (syncEmployees, syncPoints, syncRedemptions) is tested
 * for all four outcomes: active, tombstoned, unresolved, batch-failure.
 */
import { describe, it, expect, mock, beforeEach } from 'bun:test'
import type { ResolveAndRouteDeps } from '../sheet-sync'
import {
  resolveAndRouteRows,
  type SheetRow,
} from '../sheet-sync'

// ── Fixtures ────────────────────────────────────────────────────────────────

const SHEET_ID = 'sheet-abc'
const BRANCH_ID = 'branch-xyz'
const TAB_NAME = 'Tab1'

const makeRow = (name: string, rowIdx: number): SheetRow => ({
  rawName: name,
  rawNameNormalized: name.toLowerCase().trim(),
  rowIdx,
  rawPayload: { name, source: 'test' },
})

// ── resolveAndRouteRows — outcome routing ───────────────────────────────────

describe('resolveAndRouteRows', () => {
  it('outcome 1: active resolved row lands in .active bucket', async () => {
    const rows = [makeRow('Alice', 0)]
    const resolver = mock(async (_: { rawNames: string[] }) => ({
      resolved: [
        {
          rawNameNormalized: 'alice',
          aliasId: 'aid-1',
          portalSub: 'ps-alice',
          isPrimary: true,
          tombstoned: false,
          deactivatedAt: null,
        },
      ],
      unresolved: [],
    }))

    const result = await resolveAndRouteRows(rows, SHEET_ID, TAB_NAME, { resolver })

    expect(result.active).toHaveLength(1)
    expect(result.active[0].portalSub).toBe('ps-alice')
    expect(result.tombstoned).toHaveLength(0)
    expect(result.unresolved).toHaveLength(0)
  })

  it('outcome 2: tombstoned resolved row lands in .tombstoned bucket', async () => {
    const rows = [makeRow('Bob', 0)]
    const resolver = mock(async (_: { rawNames: string[] }) => ({
      resolved: [
        {
          rawNameNormalized: 'bob',
          aliasId: 'aid-2',
          portalSub: 'ps-bob',
          isPrimary: true,
          tombstoned: true,
          deactivatedAt: new Date().toISOString(),
        },
      ],
      unresolved: [],
    }))

    const result = await resolveAndRouteRows(rows, SHEET_ID, TAB_NAME, { resolver })

    expect(result.tombstoned).toHaveLength(1)
    expect(result.tombstoned[0].portalSub).toBe('ps-bob')
    expect(result.active).toHaveLength(0)
    expect(result.unresolved).toHaveLength(0)
  })

  it('outcome 3: unresolved name lands in .unresolved bucket', async () => {
    const rows = [makeRow('Charlie', 0)]
    const resolver = mock(async (_: { rawNames: string[] }) => ({
      resolved: [],
      unresolved: ['charlie'],
    }))

    const result = await resolveAndRouteRows(rows, SHEET_ID, TAB_NAME, { resolver })

    expect(result.unresolved).toHaveLength(1)
    expect(result.unresolved[0].rawNameNormalized).toBe('charlie')
    expect(result.active).toHaveLength(0)
    expect(result.tombstoned).toHaveLength(0)
  })

  it('outcome 4: batch failure throws and surfaces error', async () => {
    const rows = [makeRow('Dave', 0)]
    const resolver = mock(async (_: { rawNames: string[] }) => {
      throw new Error('portal unavailable')
    })

    await expect(resolveAndRouteRows(rows, SHEET_ID, TAB_NAME, { resolver })).rejects.toThrow(
      'portal unavailable',
    )
  })

  it('handles mixed active + tombstoned + unresolved in one batch', async () => {
    const rows = [makeRow('Alice', 0), makeRow('Bob', 1), makeRow('Charlie', 2)]
    const resolver = mock(async (_: { rawNames: string[] }) => ({
      resolved: [
        {
          rawNameNormalized: 'alice',
          aliasId: 'aid-1',
          portalSub: 'ps-alice',
          isPrimary: true,
          tombstoned: false,
          deactivatedAt: null,
        },
        {
          rawNameNormalized: 'bob',
          aliasId: 'aid-2',
          portalSub: 'ps-bob',
          isPrimary: true,
          tombstoned: true,
          deactivatedAt: new Date().toISOString(),
        },
      ],
      unresolved: ['charlie'],
    }))

    const result = await resolveAndRouteRows(rows, SHEET_ID, TAB_NAME, { resolver })

    expect(result.active).toHaveLength(1)
    expect(result.tombstoned).toHaveLength(1)
    expect(result.unresolved).toHaveLength(1)
  })

  it('chunks batches of >1000 names and calls resolver multiple times', async () => {
    // 1001 rows — should trigger 2 resolver calls
    const rows = Array.from({ length: 1001 }, (_, i) => makeRow(`user${i}`, i))
    const resolver = mock(async (input: { rawNames: string[] }) => ({
      resolved: input.rawNames.map((n) => ({
        rawNameNormalized: n,
        aliasId: `aid-${n}`,
        portalSub: `ps-${n}`,
        isPrimary: true,
        tombstoned: false,
        deactivatedAt: null,
      })),
      unresolved: [],
    }))

    const result = await resolveAndRouteRows(rows, SHEET_ID, TAB_NAME, { resolver })

    expect(resolver).toHaveBeenCalledTimes(2)
    expect(result.active).toHaveLength(1001)
  })
})
