/**
 * T1.17 — Pagination for GET /api/orbit/templates.
 *
 * The route now accepts `take` (default 50, max 200) and `skip` query
 * params and passes them through to Prisma.
 *
 * Key invariants:
 *   - Default call uses take=50, skip=0.
 *   - Explicit page-2 request (take=5, skip=5) passes those values to Prisma.
 *   - take is capped at 200.
 *
 * Prisma and requireFastAuth are mocked so no DB server is needed.
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test'

const requireFastAuthMock = mock(async () => ({ user: { id: 'user-1', role: 'admin' } }))
const userFindUniqueMock = mock(async () => ({ teamId: null, role: 'admin' }))
const templateFindManyMock = mock(async () => [] as unknown[])

mock.module('@/lib/auth/require-fast-auth', () => ({
  requireFastAuth: requireFastAuthMock,
}))

mock.module('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: userFindUniqueMock,
    },
    routineTaskTemplate: {
      findMany: templateFindManyMock,
      create: mock(async () => ({})),
    },
  },
}))

const { GET } = await import('./route')

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL('http://localhost/api/orbit/templates')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return { url: url.toString() } as unknown as Request
}

describe('GET /api/orbit/templates — T1.17 pagination', () => {
  beforeEach(() => {
    requireFastAuthMock.mockReset()
    userFindUniqueMock.mockReset()
    templateFindManyMock.mockReset()
    requireFastAuthMock.mockImplementation(async () => ({ user: { id: 'user-1', role: 'admin' } }))
    userFindUniqueMock.mockImplementation(async () => ({ teamId: null, role: 'admin' }))
    templateFindManyMock.mockImplementation(async () => [])
  })

  it('returns 401 when unauthenticated', async () => {
    requireFastAuthMock.mockImplementationOnce(async () => null)
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('passes default take=50 and skip=0 to Prisma when no params supplied', async () => {
    await GET(makeRequest())

    const [args] = templateFindManyMock.mock.calls[0] as [{ take: number; skip: number }]
    expect(args.take).toBe(50)
    expect(args.skip).toBe(0)
  })

  it('honors explicit take=5 and skip=5 (page 2) — both values forwarded to Prisma', async () => {
    await GET(makeRequest({ take: '5', skip: '5' }))

    const [args] = templateFindManyMock.mock.calls[0] as [{ take: number; skip: number }]
    expect(args.take).toBe(5)
    expect(args.skip).toBe(5)
  })

  it('caps take at 200 when a value above the ceiling is requested', async () => {
    await GET(makeRequest({ take: '9999' }))

    const [args] = templateFindManyMock.mock.calls[0] as [{ take: number }]
    expect(args.take).toBe(200)
  })

  it('filters to only active templates', async () => {
    await GET(makeRequest())

    const [args] = templateFindManyMock.mock.calls[0] as [{ where: { isActive: boolean } }]
    expect(args.where.isActive).toBe(true)
  })

  it('returns 200 with paginated template list for admin user', async () => {
    templateFindManyMock.mockImplementationOnce(async () => [
      { id: 'tmpl-1', name: 'Daily standup', frequency: 'daily', isActive: true,
        teamIds: [], teamId: null, creator: null, team: null, channel: null, checklistItems: [] },
    ])

    const res = await GET(makeRequest({ take: '5', skip: '5' }))

    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ id: string }>
    expect(body).toHaveLength(1)
    expect(body[0]?.id).toBe('tmpl-1')
  })
})
