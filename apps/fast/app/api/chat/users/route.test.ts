/**
 * T1.17 — Pagination for GET /api/chat/users.
 *
 * The route now accepts `take` (default 50, max 200) and `skip` query
 * params and passes them through to Prisma.
 *
 * Key invariants:
 *   - Default call uses take=50, skip=0.
 *   - Explicit page-2 request (take=5, skip=5) passes those values to Prisma.
 *   - take is capped at 200 (values above it are clamped).
 *
 * Prisma and requireFastAuth are mocked so no DB server is needed.
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { NextRequest } from 'next/server'

const requireFastAuthMock = mock(async () => ({ user: { id: 'user-1' } }))
const userFindManyMock = mock(async () => [] as unknown[])

mock.module('@/lib/auth/require-fast-auth', () => ({
  requireFastAuth: requireFastAuthMock,
}))

mock.module('@/lib/db', () => ({
  prisma: {
    user: {
      findMany: userFindManyMock,
    },
  },
}))

const { GET } = await import('./route')

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/chat/users')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return { url: url.toString() } as unknown as NextRequest
}

describe('GET /api/chat/users — T1.17 pagination', () => {
  beforeEach(() => {
    requireFastAuthMock.mockReset()
    userFindManyMock.mockReset()
    requireFastAuthMock.mockImplementation(async () => ({ user: { id: 'user-1' } }))
    userFindManyMock.mockImplementation(async () => [])
  })

  it('returns 401 when unauthenticated', async () => {
    requireFastAuthMock.mockImplementationOnce(async () => null)
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('passes default take=50 and skip=0 to Prisma when no params supplied', async () => {
    await GET(makeRequest())

    const [args] = userFindManyMock.mock.calls[0] as [{ take: number; skip: number }]
    expect(args.take).toBe(50)
    expect(args.skip).toBe(0)
  })

  it('honors explicit take=5 and skip=5 (page 2) — both values forwarded to Prisma', async () => {
    await GET(makeRequest({ take: '5', skip: '5' }))

    const [args] = userFindManyMock.mock.calls[0] as [{ take: number; skip: number }]
    expect(args.take).toBe(5)
    expect(args.skip).toBe(5)
  })

  it('caps take at 200 when a value above the ceiling is requested', async () => {
    await GET(makeRequest({ take: '9999' }))

    const [args] = userFindManyMock.mock.calls[0] as [{ take: number }]
    expect(args.take).toBe(200)
  })

  it('excludes the current user from the query', async () => {
    await GET(makeRequest())

    const [args] = userFindManyMock.mock.calls[0] as [{ where: { id: { not: string } } }]
    expect(args.where.id).toEqual({ not: 'user-1' })
  })

  it('returns a 200 with paginated data serialized correctly', async () => {
    userFindManyMock.mockImplementationOnce(async () => [
      { id: 'u2', name: 'Bob', email: 'b@x.com', image: null, role: 'member', lastSeenAt: null, team: null },
    ])

    const res = await GET(makeRequest({ take: '5', skip: '5' }))

    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ id: string; teamName: null }>
    expect(body).toHaveLength(1)
    expect(body[0]?.id).toBe('u2')
    expect(body[0]?.teamName).toBeNull()
  })
})
