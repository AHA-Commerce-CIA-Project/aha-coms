/**
 * T1.14 — N+1 fix: orbit analytics top-claimers aggregation now uses two
 * batched queries (user.findMany + routineTaskClaim.groupBy) instead of
 * 2×N per-user queries (one user.findUnique + one claim.count per claimer).
 *
 * Key invariant: for 5 top claimers, the route issues exactly ONE user
 * DB call and exactly ONE routineTaskClaim.groupBy call for completed counts
 * — never one pair per claimer.
 *
 * Prisma and requireFastAuth are mocked so no DB server is needed.
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { NextRequest } from 'next/server'

const requireFastAuthMock = mock(async () => ({ user: { id: 'user-1', role: 'admin' } }))
const templateFindManyMock = mock(async () => [])
const claimFindManyMock = mock(async () => [])
const claimGroupByMock = mock(async () => [])
const userFindManyMock = mock(async () => [])
const userFindUniqueMock = mock(async () => null)

mock.module('@/lib/auth/require-fast-auth', () => ({
  requireFastAuth: requireFastAuthMock,
}))

mock.module('@/lib/db', () => ({
  prisma: {
    routineTaskTemplate: {
      findMany: templateFindManyMock,
    },
    routineTaskClaim: {
      findMany: claimFindManyMock,
      groupBy: claimGroupByMock,
      count: mock(async () => 0),
    },
    user: {
      findMany: userFindManyMock,
      findUnique: userFindUniqueMock,
    },
  },
}))

mock.module('@/lib/orbit-utils', () => ({
  getCurrentPeriod: (freq: string) => `2026-05-${freq}`,
}))

const { GET } = await import('./route')

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/orbit/analytics')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return { url: url.toString() } as unknown as NextRequest
}

describe('GET /api/orbit/analytics — T1.14 batched top-claimers aggregation', () => {
  beforeEach(() => {
    requireFastAuthMock.mockReset()
    templateFindManyMock.mockReset()
    claimFindManyMock.mockReset()
    claimGroupByMock.mockReset()
    userFindManyMock.mockReset()
    userFindUniqueMock.mockReset()

    requireFastAuthMock.mockImplementation(async () => ({ user: { id: 'user-1', role: 'admin' } }))
    templateFindManyMock.mockImplementation(async () => [])
    claimFindManyMock.mockImplementation(async () => [])
    userFindManyMock.mockImplementation(async () => [])
  })

  it('returns 401 when unauthenticated', async () => {
    requireFastAuthMock.mockImplementationOnce(async () => null)
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 403 when role is member', async () => {
    requireFastAuthMock.mockImplementationOnce(async () => ({ user: { id: 'user-1', role: 'member' } }))
    const res = await GET(makeRequest())
    expect(res.status).toBe(403)
  })

  it('makes exactly ONE user.findMany and ONE routineTaskClaim.groupBy for 3 top claimers — not 6 separate queries', async () => {
    // 3 top claimers from the initial groupBy
    claimGroupByMock
      .mockImplementationOnce(async () => [
        { claimedBy: 'u1', _count: { id: 4 } },
        { claimedBy: 'u2', _count: { id: 3 } },
        { claimedBy: 'u3', _count: { id: 2 } },
      ])
      // Second groupBy call = completed-counts groupBy (batched for all 3)
      .mockImplementationOnce(async () => [
        { claimedBy: 'u1', _count: { id: 2 } },
        { claimedBy: 'u2', _count: { id: 1 } },
      ])

    userFindManyMock.mockImplementationOnce(async () => [
      { id: 'u1', name: 'Alice', image: null },
      { id: 'u2', name: 'Bob', image: null },
      { id: 'u3', name: 'Carol', image: null },
    ])

    const res = await GET(makeRequest())

    expect(res.status).toBe(200)
    // Exactly one user.findMany call for all 3 claimers — not 3 findUnique calls.
    expect(userFindManyMock).toHaveBeenCalledTimes(1)
    expect(userFindUniqueMock).not.toHaveBeenCalled()

    // The second claimGroupBy call should be the completed-counts groupBy
    // (the first is the top-claimers orderBy call before topClaimers assembly).
    // Total claimGroupBy calls: 1 (top claimers) + 1 (completed counts) = 2.
    expect(claimGroupByMock).toHaveBeenCalledTimes(2)
  })

  it('the user.findMany call uses id:in with all claimer ids', async () => {
    claimGroupByMock
      .mockImplementationOnce(async () => [
        { claimedBy: 'u1', _count: { id: 2 } },
        { claimedBy: 'u2', _count: { id: 1 } },
      ])
      .mockImplementationOnce(async () => [])

    userFindManyMock.mockImplementationOnce(async () => [])

    await GET(makeRequest())

    const [userArgs] = userFindManyMock.mock.calls[0] as [{ where: { id: { in: string[] } } }]
    expect(userArgs.where.id).toEqual({ in: expect.arrayContaining(['u1', 'u2']) })
  })

  it('response topClaimers array has correct completedClaims from batched groupBy', async () => {
    claimGroupByMock
      .mockImplementationOnce(async () => [
        { claimedBy: 'u1', _count: { id: 5 } },
      ])
      .mockImplementationOnce(async () => [
        { claimedBy: 'u1', _count: { id: 3 } },
      ])

    userFindManyMock.mockImplementationOnce(async () => [
      { id: 'u1', name: 'Alice', image: null },
    ])

    const res = await GET(makeRequest())
    const body = await res.json() as { topClaimers: Array<{ name: string; totalClaims: number; completedClaims: number; completionRate: number }> }

    expect(body.topClaimers).toHaveLength(1)
    expect(body.topClaimers[0]?.name).toBe('Alice')
    expect(body.topClaimers[0]?.totalClaims).toBe(5)
    expect(body.topClaimers[0]?.completedClaims).toBe(3)
    expect(body.topClaimers[0]?.completionRate).toBe(60)
  })
})
