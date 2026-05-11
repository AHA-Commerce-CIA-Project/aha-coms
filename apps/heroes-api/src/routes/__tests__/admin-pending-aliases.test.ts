/**
 * sweepPendingAliases tests (Slice 6D).
 *
 * Tests use dependency injection to avoid real DB/portal calls.
 * Key assertion: active-resolved rows call drainPendingAliasQueue (domain
 * replay), not just a status update.
 */
import { describe, it, expect, mock } from 'bun:test'
import { sweepPendingAliasesWithDeps, type SweepDeps } from '../admin-pending-aliases'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const pendingRow = (id: string, rawNameNormalized: string) => ({
  id,
  sheetId: 'sheet-abc',
  sheetRowNumber: 2,
  rawNameNormalized,
  rawPayload: { name: rawNameNormalized },
})

// ── sweepPendingAliasesWithDeps tests ────────────────────────────────────────

describe('sweepPendingAliasesWithDeps', () => {
  it('returns empty report when no pending rows exist', async () => {
    const deps: SweepDeps = {
      fetchAllPending: mock(async () => []),
      resolveNames: mock(async () => ({ resolved: [], unresolved: [] })),
      drainQueue: mock(async () => ({ replayed: 1 })),
      insertTombstoned: mock(async () => {}),
      markUnresolved: mock(async () => {}),
      markTombstoned: mock(async () => {}),
    }

    const report = await sweepPendingAliasesWithDeps(deps)

    expect(report.scanned).toBe(0)
    expect(report.resolvedActive).toBe(0)
    expect(deps.resolveNames).not.toHaveBeenCalled()
  })

  it('calls drainQueue for active-resolved rows (domain rows materialize)', async () => {
    const deps: SweepDeps = {
      fetchAllPending: mock(async () => [pendingRow('row-1', 'alice')]),
      resolveNames: mock(async () => ({
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
      })),
      drainQueue: mock(async () => ({ replayed: 1 })),
      insertTombstoned: mock(async () => {}),
      markUnresolved: mock(async () => {}),
      markTombstoned: mock(async () => {}),
    }

    const report = await sweepPendingAliasesWithDeps(deps)

    expect(report.resolvedActive).toBe(1)
    expect(deps.drainQueue).toHaveBeenCalledWith('alice', 'ps-alice')
    expect(deps.insertTombstoned).not.toHaveBeenCalled()
  })

  it('writes audit and marks tombstoned for tombstoned resolved rows', async () => {
    const deps: SweepDeps = {
      fetchAllPending: mock(async () => [pendingRow('row-2', 'bob')]),
      resolveNames: mock(async () => ({
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
      })),
      drainQueue: mock(async () => ({ replayed: 0 })),
      insertTombstoned: mock(async () => {}),
      markUnresolved: mock(async () => {}),
      markTombstoned: mock(async () => {}),
    }

    const report = await sweepPendingAliasesWithDeps(deps)

    expect(report.resolvedTombstoned).toBe(1)
    expect(deps.insertTombstoned).toHaveBeenCalledTimes(1)
    expect(deps.markTombstoned).toHaveBeenCalledWith('row-2')
    expect(deps.drainQueue).not.toHaveBeenCalled()
  })

  it('increments retry for unresolved rows without draining', async () => {
    const deps: SweepDeps = {
      fetchAllPending: mock(async () => [pendingRow('row-3', 'charlie')]),
      resolveNames: mock(async () => ({
        resolved: [],
        unresolved: ['charlie'],
      })),
      drainQueue: mock(async () => ({ replayed: 0 })),
      insertTombstoned: mock(async () => {}),
      markUnresolved: mock(async () => {}),
      markTombstoned: mock(async () => {}),
    }

    const report = await sweepPendingAliasesWithDeps(deps)

    expect(report.unresolved).toBe(1)
    expect(deps.markUnresolved).toHaveBeenCalledWith('row-3')
    expect(deps.drainQueue).not.toHaveBeenCalled()
  })

  it('handles mixed outcomes in one sweep', async () => {
    const deps: SweepDeps = {
      fetchAllPending: mock(async () => [
        pendingRow('row-4', 'alice'),
        pendingRow('row-5', 'bob'),
        pendingRow('row-6', 'charlie'),
      ]),
      resolveNames: mock(async () => ({
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
      })),
      drainQueue: mock(async () => ({ replayed: 1 })),
      insertTombstoned: mock(async () => {}),
      markUnresolved: mock(async () => {}),
      markTombstoned: mock(async () => {}),
    }

    const report = await sweepPendingAliasesWithDeps(deps)

    expect(report.resolvedActive).toBe(1)
    expect(report.resolvedTombstoned).toBe(1)
    expect(report.unresolved).toBe(1)
    expect(deps.drainQueue).toHaveBeenCalledTimes(1)
    expect(deps.insertTombstoned).toHaveBeenCalledTimes(1)
    expect(deps.markUnresolved).toHaveBeenCalledTimes(1)
  })

  it('surfaces resolver batch error in report.errors', async () => {
    const deps: SweepDeps = {
      fetchAllPending: mock(async () => [pendingRow('row-7', 'dave')]),
      resolveNames: mock(async () => {
        throw new Error('portal timeout')
      }),
      drainQueue: mock(async () => ({ replayed: 0 })),
      insertTombstoned: mock(async () => {}),
      markUnresolved: mock(async () => {}),
      markTombstoned: mock(async () => {}),
    }

    const report = await sweepPendingAliasesWithDeps(deps)

    expect(report.errors.length).toBeGreaterThan(0)
    expect(report.errors[0]).toContain('portal timeout')
    expect(report.resolvedActive).toBe(0)
  })
})
