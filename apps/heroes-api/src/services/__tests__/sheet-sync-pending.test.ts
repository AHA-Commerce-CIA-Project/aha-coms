/**
 * drainPendingAliasQueue tests (Slice 6C).
 *
 * Tests use a mock db to avoid real DB connections.
 * We verify that drain: writes domain rows, marks status='resolved',
 * and returns the correct replayed count.
 */
import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { drainPendingAliasQueueWithDeps } from '../sheet-sync-pending'
import type { DrainDeps } from '../sheet-sync-pending'

// ── Fixtures ────────────────────────────────────────────────────────────────

const PORTAL_SUB = 'ps-alice'
const RAW_NAME_NORMALIZED = 'alice'

const makePointsPayload = (overrides: Record<string, unknown> = {}) => ({
  name: 'Alice',
  timestamp: '2024-01-01 09:00:00',
  reason: 'Great job',
  screenshot: null,
  points: 1,
  ...overrides,
})

const makeEmployeePayload = (overrides: Record<string, unknown> = {}) => ({
  name: 'Alice',
  teamName: 'Alpha',
  employmentStatus: 'active',
  ...overrides,
})

const makeRedemptionPayload = (overrides: Record<string, unknown> = {}) => ({
  name: 'Alice',
  timestamp: '2024-01-15 10:00:00',
  reward: 'Coffee Voucher (10)',
  notes: null,
  ...overrides,
})

// ── drainPendingAliasQueueWithDeps tests ────────────────────────────────────

describe('drainPendingAliasQueueWithDeps', () => {
  it('returns replayed: 0 when queue is empty', async () => {
    const deps: DrainDeps = {
      fetchPending: mock(async () => []),
      markResolved: mock(async () => {}),
      markFailed: mock(async () => {}),
      insertPoint: mock(async () => {}),
      insertRedemption: mock(async () => {}),
      upsertProfile: mock(async () => {}),
      lookupCategory: mock(async () => null),
    }

    const result = await drainPendingAliasQueueWithDeps(RAW_NAME_NORMALIZED, PORTAL_SUB, deps)
    expect(result.replayed).toBe(0)
    expect(deps.markResolved).not.toHaveBeenCalled()
  })

  it('replays a points row and marks it resolved', async () => {
    const payload = makePointsPayload()
    const deps: DrainDeps = {
      fetchPending: mock(async () => [
        {
          id: 'row-1',
          sheetId: 'sheet-abc',
          sheetRowNumber: 2,
          rawName: 'Alice',
          rawNameNormalized: RAW_NAME_NORMALIZED,
          rawPayload: payload,
        },
      ]),
      markResolved: mock(async () => {}),
      markFailed: mock(async () => {}),
      insertPoint: mock(async () => {}),
      insertRedemption: mock(async () => {}),
      upsertProfile: mock(async () => {}),
      lookupCategory: mock(async () => ({ id: 'cat-bintang', code: 'BINTANG' })),
    }

    const result = await drainPendingAliasQueueWithDeps(RAW_NAME_NORMALIZED, PORTAL_SUB, deps)

    expect(result.replayed).toBe(1)
    expect(deps.insertPoint).toHaveBeenCalledTimes(1)
    expect(deps.markResolved).toHaveBeenCalledWith('row-1')
    expect(deps.markFailed).not.toHaveBeenCalled()
  })

  it('replays a redemption row and marks it resolved', async () => {
    const payload = makeRedemptionPayload()
    const deps: DrainDeps = {
      fetchPending: mock(async () => [
        {
          id: 'row-2',
          sheetId: 'sheet-abc',
          sheetRowNumber: 3,
          rawName: 'Alice',
          rawNameNormalized: RAW_NAME_NORMALIZED,
          rawPayload: payload,
        },
      ]),
      markResolved: mock(async () => {}),
      markFailed: mock(async () => {}),
      insertPoint: mock(async () => {}),
      insertRedemption: mock(async () => {}),
      upsertProfile: mock(async () => {}),
      lookupCategory: mock(async () => null),
    }

    const result = await drainPendingAliasQueueWithDeps(RAW_NAME_NORMALIZED, PORTAL_SUB, deps)

    expect(result.replayed).toBe(1)
    expect(deps.insertRedemption).toHaveBeenCalledTimes(1)
    expect(deps.markResolved).toHaveBeenCalledWith('row-2')
  })

  it('replays an employee row and marks it resolved', async () => {
    const payload = makeEmployeePayload()
    const deps: DrainDeps = {
      fetchPending: mock(async () => [
        {
          id: 'row-3',
          sheetId: 'sheet-abc',
          sheetRowNumber: 4,
          rawName: 'Alice',
          rawNameNormalized: RAW_NAME_NORMALIZED,
          rawPayload: payload,
        },
      ]),
      markResolved: mock(async () => {}),
      markFailed: mock(async () => {}),
      insertPoint: mock(async () => {}),
      insertRedemption: mock(async () => {}),
      upsertProfile: mock(async () => {}),
      lookupCategory: mock(async () => null),
    }

    const result = await drainPendingAliasQueueWithDeps(RAW_NAME_NORMALIZED, PORTAL_SUB, deps)

    expect(result.replayed).toBe(1)
    expect(deps.upsertProfile).toHaveBeenCalledTimes(1)
    expect(deps.markResolved).toHaveBeenCalledWith('row-3')
  })

  it('marks row failed and increments retry_count when insert throws', async () => {
    const payload = makePointsPayload()
    const deps: DrainDeps = {
      fetchPending: mock(async () => [
        {
          id: 'row-4',
          sheetId: 'sheet-abc',
          sheetRowNumber: 2,
          rawName: 'Alice',
          rawNameNormalized: RAW_NAME_NORMALIZED,
          rawPayload: payload,
        },
      ]),
      markResolved: mock(async () => {}),
      markFailed: mock(async () => {}),
      insertPoint: mock(async () => { throw new Error('db error') }),
      insertRedemption: mock(async () => {}),
      upsertProfile: mock(async () => {}),
      lookupCategory: mock(async () => ({ id: 'cat-bintang', code: 'BINTANG' })),
    }

    const result = await drainPendingAliasQueueWithDeps(RAW_NAME_NORMALIZED, PORTAL_SUB, deps)

    expect(result.replayed).toBe(0)
    expect(deps.markFailed).toHaveBeenCalledWith('row-4')
    expect(deps.markResolved).not.toHaveBeenCalled()
  })

  it('replays multiple rows of mixed types', async () => {
    const deps: DrainDeps = {
      fetchPending: mock(async () => [
        {
          id: 'row-5',
          sheetId: 'sheet-abc',
          sheetRowNumber: 2,
          rawName: 'Alice',
          rawNameNormalized: RAW_NAME_NORMALIZED,
          rawPayload: makePointsPayload(),
        },
        {
          id: 'row-6',
          sheetId: 'sheet-abc',
          sheetRowNumber: 3,
          rawName: 'Alice',
          rawNameNormalized: RAW_NAME_NORMALIZED,
          rawPayload: makeRedemptionPayload(),
        },
      ]),
      markResolved: mock(async () => {}),
      markFailed: mock(async () => {}),
      insertPoint: mock(async () => {}),
      insertRedemption: mock(async () => {}),
      upsertProfile: mock(async () => {}),
      lookupCategory: mock(async () => ({ id: 'cat-bintang', code: 'BINTANG' })),
    }

    const result = await drainPendingAliasQueueWithDeps(RAW_NAME_NORMALIZED, PORTAL_SUB, deps)

    expect(result.replayed).toBe(2)
    expect(deps.insertPoint).toHaveBeenCalledTimes(1)
    expect(deps.insertRedemption).toHaveBeenCalledTimes(1)
    expect(deps.markResolved).toHaveBeenCalledTimes(2)
  })
})
