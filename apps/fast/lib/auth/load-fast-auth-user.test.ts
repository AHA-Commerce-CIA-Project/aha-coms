/**
 * Unit tests for loadFastAuthUser.
 *
 * Mirrors the contract `loadHeroesAuthUser` enforces in
 * packages/heroes-shared/src/auth/user.ts: the helper resolves an
 * AuthUser for a valid portal `__session` cookie, returns null on 401,
 * and throws `PortalSessionDeniedError` when the session is valid but
 * the user has no `fast` app slug.
 *
 * Prisma is mocked so the test stays free of DB-server dependencies
 * (mirrors the no-DB heroes verification path — heroes-shared also has
 * no DB-backed unit tests; loadFastAuthUser owns its own test file
 * because fast does not have the equivalent end-to-end auth-path
 * smoke yet).
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

type UpsertArgs = { where: unknown; create: Record<string, unknown>; update: Record<string, unknown> }

const upsertMock = mock(async (args: UpsertArgs) => ({
  id: 'fast-user-1',
  email: args.create.email as string,
  name: args.create.name as string,
  role: 'member',
  teamId: null,
  portal_sub: args.update.portal_sub ?? args.create.portal_sub,
}))

mock.module('@/lib/db', () => ({
  prisma: {
    user: {
      upsert: upsertMock,
    },
  },
}))

const { loadFastAuthUser, PortalSessionDeniedError, __resetAuthCacheForTests } = await import(
  './load-fast-auth-user',
)

const PORTAL_ORIGIN = 'https://aha-coms.web.app'

const originalFetch = globalThis.fetch

function userinfoResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      sub: '00000000-0000-0000-0000-000000000001',
      name: 'Alice',
      email: 'alice@aha.com',
      emails: [
        {
          emailId: 'e-1',
          address: 'alice@aha.com',
          kind: 'workspace',
          isPrimary: true,
          verified: true,
          addedBy: 'admin',
        },
      ],
      portalRole: 'employee',
      avatar_url: null,
      apps: [
        { slug: 'portal', label: 'COMS', url: '/portal/dashboard' },
        { slug: 'fast', label: 'FAST', url: '/fast/' },
      ],
      ...overrides,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

beforeEach(() => {
  upsertMock.mockClear()
  __resetAuthCacheForTests()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('loadFastAuthUser', () => {
  it('returns AuthUser + appCatalog for a valid session with the fast app', async () => {
    globalThis.fetch = mock(async () => userinfoResponse()) as unknown as typeof fetch

    const result = await loadFastAuthUser('opaque-session-id', PORTAL_ORIGIN)

    expect(result).not.toBeNull()
    expect(result?.user.id).toBe('fast-user-1')
    expect(result?.user.email).toBe('alice@aha.com')
    expect(result?.user.apps).toContain('fast')
    expect(result?.appCatalog.map((a) => a.slug)).toEqual(['portal', 'fast'])
    expect(upsertMock).toHaveBeenCalledTimes(1)
    const upsertArgs = upsertMock.mock.calls[0]![0] as UpsertArgs
    expect((upsertArgs.where as { portal_sub: string }).portal_sub).toBe(
      '00000000-0000-0000-0000-000000000001',
    )
  })

  it('returns null when portal-api responds 401', async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ message: 'No session cookie' }), { status: 401 }),
    ) as unknown as typeof fetch

    const result = await loadFastAuthUser('expired-session', PORTAL_ORIGIN)

    expect(result).toBeNull()
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it("throws PortalSessionDeniedError when the user's apps claim has no 'fast' slug", async () => {
    globalThis.fetch = mock(async () =>
      userinfoResponse({
        apps: [
          { slug: 'portal', label: 'COMS', url: '/portal/dashboard' },
          { slug: 'heroes', label: 'HEROES', url: '/heroes/' },
        ],
      }),
    ) as unknown as typeof fetch

    await expect(loadFastAuthUser('valid-but-no-access', PORTAL_ORIGIN)).rejects.toBeInstanceOf(
      PortalSessionDeniedError,
    )
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('throws on non-401 server error', async () => {
    globalThis.fetch = mock(async () =>
      new Response('boom', { status: 502, statusText: 'Bad Gateway' }),
    ) as unknown as typeof fetch

    await expect(loadFastAuthUser('any', PORTAL_ORIGIN)).rejects.toThrow(/userinfo call failed: 502/)
  })

  it('forwards the __session cookie on the userinfo request', async () => {
    const fetchSpy = mock(async () => userinfoResponse()) as unknown as typeof fetch
    globalThis.fetch = fetchSpy

    await loadFastAuthUser('the-cookie-value', PORTAL_ORIGIN)

    const [url, init] = (fetchSpy as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]!
    expect(url).toBe(`${PORTAL_ORIGIN}/api/userinfo`)
    const headers = (init.headers as Record<string, string>) ?? {}
    expect(headers.cookie).toBe('__session=the-cookie-value')
  })

  it('coalesces repeat calls with the same __session cookie — one portal fetch + one upsert', async () => {
    let fetchCount = 0
    globalThis.fetch = mock(async () => {
      fetchCount++
      return userinfoResponse()
    }) as unknown as typeof fetch

    await loadFastAuthUser('repeat-cookie', PORTAL_ORIGIN)
    await loadFastAuthUser('repeat-cookie', PORTAL_ORIGIN)
    await loadFastAuthUser('repeat-cookie', PORTAL_ORIGIN)

    expect(fetchCount).toBe(1)
    expect(upsertMock).toHaveBeenCalledTimes(1)
  })

  it('treats distinct session cookies as separate cache entries', async () => {
    let fetchCount = 0
    globalThis.fetch = mock(async () => {
      fetchCount++
      return userinfoResponse()
    }) as unknown as typeof fetch

    await loadFastAuthUser('cookie-A', PORTAL_ORIGIN)
    await loadFastAuthUser('cookie-B', PORTAL_ORIGIN)

    expect(fetchCount).toBe(2)
    expect(upsertMock).toHaveBeenCalledTimes(2)
  })

  it('does not cache 401 results — a revoked session re-checks portal-api on retry', async () => {
    let fetchCount = 0
    globalThis.fetch = mock(async () => {
      fetchCount++
      return new Response(JSON.stringify({ message: 'No session cookie' }), { status: 401 })
    }) as unknown as typeof fetch

    const a = await loadFastAuthUser('expired', PORTAL_ORIGIN)
    const b = await loadFastAuthUser('expired', PORTAL_ORIGIN)

    expect(a).toBeNull()
    expect(b).toBeNull()
    expect(fetchCount).toBe(2)
    expect(upsertMock).not.toHaveBeenCalled()
  })
})
