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
  buildPointsToInsert,
  resolveAndRouteRows,
  runFullResync,
  type ActiveRow,
  type ParsedPoint,
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
    const resolver = mock(async (_: { names: string[] }) => ({
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
    const resolver = mock(async (_: { names: string[] }) => ({
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
    const resolver = mock(async (_: { names: string[] }) => ({
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
    const resolver = mock(async (_: { names: string[] }) => {
      throw new Error('portal unavailable')
    })

    await expect(resolveAndRouteRows(rows, SHEET_ID, TAB_NAME, { resolver })).rejects.toThrow(
      'portal unavailable',
    )
  })

  it('handles mixed active + tombstoned + unresolved in one batch', async () => {
    const rows = [makeRow('Alice', 0), makeRow('Bob', 1), makeRow('Charlie', 2)]
    const resolver = mock(async (_: { names: string[] }) => ({
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
    const resolver = mock(async (input: { names: string[] }) => ({
      resolved: input.names.map((n) => ({
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

// ── buildPointsToInsert — dedup-by-rowIdx contract ──────────────────────────

describe('buildPointsToInsert', () => {
  const BRANCH_KEY = 'jakarta'
  const CATEGORY_ID = 'cat-penalti'
  const ADMIN_ID = 'ps-admin'

  const makeParsed = (
    rowIdx: number,
    name: string,
    overrides: Partial<Omit<ParsedPoint, 'sheetRow'>> = {},
  ): ParsedPoint => ({
    sheetRow: {
      rawName: name,
      rawNameNormalized: name.toLowerCase().trim(),
      rowIdx,
      rawPayload: {},
    },
    reason: `reason-${rowIdx}`,
    screenshotUrl: null,
    points: 1,
    kittaComponent: 'T1',
    createdAt: new Date(`2026-04-${String(rowIdx + 1).padStart(2, '0')}T00:00:00Z`),
    ...overrides,
  })

  const asActive = (parsed: ParsedPoint, portalSub: string): ActiveRow => ({
    row: parsed.sheetRow,
    portalSub,
  })

  it('emits one insert per sheet row even when several rows share a name (regression: 5 dup Penalti rows for "Handers The")', () => {
    // 5 distinct Penalti rows for the same person — different reasons, different dates.
    // Pre-fix this collapsed to a single ParsedPoint via Map<name, p> dedup, then
    // replicated the survivor across all 5 active entries → 5 identical inserts.
    const parsedRows = [
      makeParsed(0, 'Handers The', { reason: 'late uniform Tuesday', kittaComponent: 'T1' }),
      makeParsed(1, 'Handers The', { reason: 'wrong omset formula', points: 3, kittaComponent: 'K' }),
      makeParsed(2, 'Handers The', { reason: 'missed SHOP check', kittaComponent: 'K' }),
      makeParsed(3, 'Handers The', { reason: 'late weekly schedule', kittaComponent: 'T1' }),
      makeParsed(4, 'Handers The', { reason: 'profit analysis bug', points: 3, kittaComponent: 'K' }),
    ]
    const routedActive = parsedRows.map((p) => asActive(p, 'ps-handers-the'))

    const result = buildPointsToInsert({
      parsedRows,
      routedActive,
      dbCounts: new Map(),
      branchKey: BRANCH_KEY,
      categoryId: CATEGORY_ID,
      categoryCode: 'PENALTI',
      adminProfileId: ADMIN_ID,
      now: new Date('2026-05-08T00:00:00Z'),
    })

    expect(result.toInsert).toHaveLength(5)
    expect(result.processed).toBe(5)

    // All 5 must carry their own reason — the bug surfaced as 5 identical rows.
    const reasons = result.toInsert.map((r) => r.reason).sort()
    expect(reasons).toEqual([
      'late uniform Tuesday',
      'late weekly schedule',
      'missed SHOP check',
      'profit analysis bug',
      'wrong omset formula',
    ])

    // And their createdAt timestamps must match the parsed input order, not all the survivor's.
    const isoDates = result.toInsert.map((r) => r.createdAt.toISOString()).sort()
    expect(isoDates).toEqual([
      '2026-04-01T00:00:00.000Z',
      '2026-04-02T00:00:00.000Z',
      '2026-04-03T00:00:00.000Z',
      '2026-04-04T00:00:00.000Z',
      '2026-04-05T00:00:00.000Z',
    ])
  })

  it('respects dbCounts: skips rows already present in DB N times (incremental dedup)', () => {
    const parsed = makeParsed(0, 'Alice', { reason: 'r1', points: 2 })
    const routedActive = [asActive(parsed, 'ps-alice')]

    const dedupKey = `ps-alice|r1|2|2026-04-01 00:00:00`
    const dbCounts = new Map([[dedupKey, 1]])

    const result = buildPointsToInsert({
      parsedRows: [parsed],
      routedActive,
      dbCounts,
      branchKey: BRANCH_KEY,
      categoryId: CATEGORY_ID,
      categoryCode: 'PENALTI',
      adminProfileId: ADMIN_ID,
      now: new Date('2026-05-08T00:00:00Z'),
    })

    expect(result.toInsert).toHaveLength(0)
    // Still counts as "processed" — we saw it, decided to skip.
    expect(result.processed).toBe(1)
  })

  it('BINTANG sets submittedBy=portalSub; PENALTI/POIN_AHA fall back to admin', () => {
    const aliceParsed = makeParsed(0, 'Alice', { reason: 'r1' })
    const bobParsed = makeParsed(1, 'Bob', { reason: 'r2' })
    const routedActive = [asActive(aliceParsed, 'ps-alice'), asActive(bobParsed, 'ps-bob')]

    const bintang = buildPointsToInsert({
      parsedRows: [aliceParsed, bobParsed],
      routedActive,
      dbCounts: new Map(),
      branchKey: BRANCH_KEY,
      categoryId: CATEGORY_ID,
      categoryCode: 'BINTANG',
      adminProfileId: ADMIN_ID,
      now: new Date(),
    })
    expect(bintang.toInsert.map((r) => r.submittedBy)).toEqual(['ps-alice', 'ps-bob'])

    const penalti = buildPointsToInsert({
      parsedRows: [aliceParsed, bobParsed],
      routedActive,
      dbCounts: new Map(),
      branchKey: BRANCH_KEY,
      categoryId: CATEGORY_ID,
      categoryCode: 'PENALTI',
      adminProfileId: ADMIN_ID,
      now: new Date(),
    })
    expect(penalti.toInsert.map((r) => r.submittedBy)).toEqual([ADMIN_ID, ADMIN_ID])
  })

  it('falls back to portalSub when admin profile is missing', () => {
    const parsed = makeParsed(0, 'Alice', { reason: 'r1' })
    const result = buildPointsToInsert({
      parsedRows: [parsed],
      routedActive: [asActive(parsed, 'ps-alice')],
      dbCounts: new Map(),
      branchKey: BRANCH_KEY,
      categoryId: CATEGORY_ID,
      categoryCode: 'PENALTI',
      adminProfileId: undefined,
      now: new Date(),
    })
    expect(result.toInsert[0].submittedBy).toBe('ps-alice')
  })
})

// ── runFullResync — transactional safety ────────────────────────────────────

describe('runFullResync (transactional)', () => {
  /**
   * Build a fake `DbClient` that records the call sequence. Its `.transaction`
   * runs the callback with a tx-scoped fake; everything inside the callback is
   * tagged "in-tx", everything outside is tagged "outside-tx". If the callback
   * throws, the fake re-throws (mirroring real PG rollback semantics).
   */
  function makeFakeDb(opts: { failInside?: boolean } = {}) {
    const events: string[] = []
    const noopWhere = { where: async () => undefined }
    const noopSelect = {
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }
    const txHandle = {
      delete: () => {
        events.push('delete-in-tx')
        if (opts.failInside) throw new Error('simulated import failure')
        return noopWhere
      },
      select: () => noopSelect,
      insert: () => ({ values: async () => undefined, onConflictDoNothing: () => ({ returning: async () => [] }) }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
      execute: async () => undefined,
    }
    const outerDb = {
      delete: () => {
        events.push('delete-OUTSIDE-tx')
        return noopWhere
      },
      select: () => noopSelect,
      insert: () => ({ values: async () => undefined }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
      execute: async () => undefined,
      transaction: async (fn: (tx: typeof txHandle) => Promise<unknown>) => {
        events.push('begin-tx')
        try {
          const result = await fn(txHandle)
          events.push('commit-tx')
          return result
        } catch (err) {
          events.push('rollback-tx')
          throw err
        }
      },
    }
    return { db: outerDb, events }
  }

  it('runs all delete statements inside db.transaction (so a failed import rolls back the wipe)', async () => {
    const { db, events } = makeFakeDb()

    // Empty sheet ids — readSheet would still be called by runFullSync, but the
    // tx wrap must happen BEFORE any sync work. We swallow the inevitable
    // downstream error and assert the wrap occurred first.
    await runFullResync(
      { points: '', employees: '' },
      {
        employees: 'E',
        bintang: 'B',
        penalti: 'P',
        poinAha: 'A',
        redeem: 'R',
      },
      'branch-x',
      undefined,
      db as never,
    ).catch(() => undefined)

    // The transaction must wrap the deletes — none of them may run on the outer db.
    expect(events).toContain('begin-tx')
    expect(events).not.toContain('delete-OUTSIDE-tx')
    // All three transactional tables (redemptions, achievement_points, point_summaries)
    // must be deleted inside the same transaction.
    const inTxDeletes = events.filter((e) => e === 'delete-in-tx').length
    expect(inTxDeletes).toBe(3)
  })

  it('propagates inner failures so the transaction rolls back', async () => {
    const { db, events } = makeFakeDb({ failInside: true })

    await expect(
      runFullResync(
        { points: '', employees: '' },
        {
          employees: 'E',
          bintang: 'B',
          penalti: 'P',
          poinAha: 'A',
          redeem: 'R',
        },
        'branch-x',
        undefined,
        db as never,
      ),
    ).rejects.toThrow('simulated import failure')

    // Rollback path was taken (real PG would unwind the wipe).
    expect(events).toContain('rollback-tx')
    expect(events).not.toContain('commit-tx')
  })

  it('a catastrophic step error during a resync rolls back the wipe (the readSheet-throws case)', async () => {
    // Empty sheet ids cause readSheet to throw (no Google Sheets access).
    // Pre-fix, runStep swallowed the throw and let the tx commit with the
    // wipe applied — exactly the data-loss case the user hit on prod.
    const { db, events } = makeFakeDb()

    const promise = runFullResync(
      { points: '', employees: '' },
      {
        employees: 'E',
        bintang: 'B',
        penalti: 'P',
        poinAha: 'A',
        redeem: 'R',
      },
      'branch-x',
      undefined,
      db as never,
    )

    // The promise must reject — that's how the tx knows to rollback.
    await expect(promise).rejects.toBeDefined()
    expect(events).toContain('begin-tx')
    expect(events).toContain('rollback-tx')
    expect(events).not.toContain('commit-tx')
  })
})
