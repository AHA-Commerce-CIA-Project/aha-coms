/**
 * Unit tests for /fast/api/health.
 *
 * The endpoint serves two consumers:
 *  - Cloud Run startup + liveness probes (declared in
 *    infra/fast/cloud-run.tf as /fast/api/health, container-direct).
 *  - Portal's dashboard health probe (60-second polling, post-T76
 *    registration).
 *
 * Returns 200 with { status: 'ok', dbReachable: true } when prisma can
 * round-trip a trivial query, 503 with { status: 'degraded',
 * dbReachable: false } otherwise. Prisma is mocked so the test stays
 * free of DB-server dependencies (same shape as load-fast-auth-user.test).
 *
 * The webhookSubscriptionActive field T79's task description named is
 * deferred until T77 lands fast's webhook consumer + dedup table; the
 * endpoint stays forward-compatible by always returning the two fields
 * downstream consumers can read today.
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test'

const queryRawMock = mock(async () => [{ '?column?': 1 }])

mock.module('@/lib/db', () => ({
  prisma: {
    $queryRaw: queryRawMock,
  },
}))

const { GET } = await import('./route')

describe('GET /api/health', () => {
  beforeEach(() => {
    queryRawMock.mockReset()
  })

  it('returns 200 + dbReachable:true when prisma round-trips a trivial query', async () => {
    queryRawMock.mockImplementationOnce(async () => [{ '?column?': 1 }])

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.dbReachable).toBe(true)
    expect(queryRawMock).toHaveBeenCalledTimes(1)
  })

  it('returns 503 + dbReachable:false when prisma throws', async () => {
    queryRawMock.mockImplementationOnce(async () => {
      throw new Error('connection refused')
    })

    const res = await GET()

    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('degraded')
    expect(body.dbReachable).toBe(false)
  })

  it('does not require authentication (middleware allowlists /api/health)', async () => {
    queryRawMock.mockImplementationOnce(async () => [{ '?column?': 1 }])

    // The route handler must work without a session — middleware
    // (apps/fast/middleware.ts) puts /api/health on the public allowlist
    // so Cloud Run's container-direct probe never carries __session.
    const res = await GET()
    expect(res.status).toBe(200)
  })
})
