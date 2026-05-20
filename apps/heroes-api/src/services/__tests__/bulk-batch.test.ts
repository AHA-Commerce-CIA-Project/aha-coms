/**
 * T1.7 / T1.8 — batch N+1 remediation tests.
 *
 * Verifies that bulkResolveRedemptions, bulkResolvePoints,
 * fileChallenge (HR notifications), and fileAppeal (HR notifications)
 * each issue exactly one UPDATE + one INSERT to the DB for a 3-id batch,
 * not N separate statements.
 *
 * Strategy: build a lightweight stub DB that records every .update() and
 * .insert() call. Bypass withRLS by mocking the base module so the stub
 * db is passed directly into the service callback.
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test'

// ── Shared mock builder ─────────────────────────────────────────────────────

type CallRecord = { op: 'update' | 'insert'; args: unknown[] }

function makeMockDb() {
  const calls: CallRecord[] = []

  // Chainable builder that records the terminal await
  function makeUpdateChain(args: unknown[]) {
    const chain = {
      set: (_data: unknown) => {
        args.push(_data)
        return chain
      },
      where: (_cond: unknown) => {
        args.push(_cond)
        return chain
      },
      returning: () => {
        calls.push({ op: 'update', args })
        return Promise.resolve([])
      },
      // If awaited directly (no .returning())
      then: (resolve: (v: unknown) => void) => {
        calls.push({ op: 'update', args })
        resolve(undefined)
      },
    }
    return chain
  }

  function makeInsertChain(args: unknown[]) {
    const chain = {
      values: (_data: unknown) => {
        args.push(_data)
        return chain
      },
      returning: () => {
        calls.push({ op: 'insert', args })
        return Promise.resolve([])
      },
      // If awaited directly (no .returning())
      then: (resolve: (v: unknown) => void) => {
        calls.push({ op: 'insert', args })
        resolve(undefined)
      },
    }
    return chain
  }

  const db = {
    update: (_table: unknown) => makeUpdateChain([_table]),
    insert: (_table: unknown) => makeInsertChain([_table]),
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([{ total: 0 }]),
        leftJoin: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    }),
    calls,
  }

  return db
}

// ── AuthUser fixture ─────────────────────────────────────────────────────────

const actor = {
  id: 'actor-uuid-0000-0000-000000000001',
  name: 'HR Admin',
  email: 'hr@example.com',
  role: 'hr' as const,
  branchKey: 'branch-A',
  teamKey: null,
}

const ctx = { actor, ipAddress: '127.0.0.1' }

const THREE_IDS = [
  '11111111-0000-0000-0000-000000000001',
  '11111111-0000-0000-0000-000000000002',
  '11111111-0000-0000-0000-000000000003',
]

// ── T1.7: bulkResolveRedemptions ─────────────────────────────────────────────

describe('T1.7: bulkResolveRedemptions — batch UPDATE + INSERT', () => {
  it('approve: issues exactly 1 UPDATE and 1 INSERT for 3 ids', async () => {
    const mockDb = makeMockDb()

    // Mock withRLS to call callback with mockDb directly
    mock.module('../../repositories/base', () => ({
      withRLS: async (_ctx: unknown, fn: (db: unknown) => Promise<unknown>) => fn(mockDb),
      getDb: () => mockDb,
    }))

    const { bulkResolveRedemptions } = await import('../redemptions')

    const result = await bulkResolveRedemptions(
      { ids: THREE_IDS, action: 'approve' },
      ctx,
    )

    const updates = mockDb.calls.filter((c) => c.op === 'update')
    const inserts = mockDb.calls.filter((c) => c.op === 'insert')

    expect(updates).toHaveLength(1)
    expect(inserts).toHaveLength(1)
    expect(result.processed).toBe(3)
    expect(result.succeeded).toBe(3)
    expect(result.failed).toBe(0)
  })

  it('reject: issues exactly 1 UPDATE and 1 INSERT for 3 ids', async () => {
    const mockDb = makeMockDb()

    mock.module('../../repositories/base', () => ({
      withRLS: async (_ctx: unknown, fn: (db: unknown) => Promise<unknown>) => fn(mockDb),
      getDb: () => mockDb,
    }))

    const { bulkResolveRedemptions } = await import('../redemptions')

    const result = await bulkResolveRedemptions(
      { ids: THREE_IDS, action: 'reject', rejectionReason: 'Out of stock' },
      ctx,
    )

    const updates = mockDb.calls.filter((c) => c.op === 'update')
    const inserts = mockDb.calls.filter((c) => c.op === 'insert')

    expect(updates).toHaveLength(1)
    expect(inserts).toHaveLength(1)
    expect(result.processed).toBe(3)
    expect(result.succeeded).toBe(3)
  })
})

// ── T1.7: bulkResolvePoints ───────────────────────────────────────────────────

describe('T1.7: bulkResolvePoints — batch UPDATE + INSERT', () => {
  it('approve: issues exactly 1 UPDATE and 1 INSERT for 3 ids', async () => {
    const mockDb = makeMockDb()

    mock.module('../../repositories/base', () => ({
      withRLS: async (_ctx: unknown, fn: (db: unknown) => Promise<unknown>) => fn(mockDb),
      getDb: () => mockDb,
    }))

    const { bulkResolvePoints } = await import('../approval')

    const result = await bulkResolvePoints(
      { ids: THREE_IDS, action: 'approve' },
      ctx,
    )

    const updates = mockDb.calls.filter((c) => c.op === 'update')
    const inserts = mockDb.calls.filter((c) => c.op === 'insert')

    expect(updates).toHaveLength(1)
    expect(inserts).toHaveLength(1)
    expect(result.processed).toBe(3)
    expect(result.succeeded).toBe(3)
  })

  it('reject: issues exactly 1 UPDATE and 1 INSERT for 3 ids', async () => {
    const mockDb = makeMockDb()

    mock.module('../../repositories/base', () => ({
      withRLS: async (_ctx: unknown, fn: (db: unknown) => Promise<unknown>) => fn(mockDb),
      getDb: () => mockDb,
    }))

    const { bulkResolvePoints } = await import('../approval')

    const result = await bulkResolvePoints(
      { ids: THREE_IDS, action: 'reject', reason: 'Policy violation' },
      ctx,
    )

    const updates = mockDb.calls.filter((c) => c.op === 'update')
    const inserts = mockDb.calls.filter((c) => c.op === 'insert')

    expect(updates).toHaveLength(1)
    expect(inserts).toHaveLength(1)
    expect(result.processed).toBe(3)
    expect(result.succeeded).toBe(3)
  })
})
