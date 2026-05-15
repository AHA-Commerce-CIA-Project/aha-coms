/**
 * Unit tests for GET /fast/api/chat/unread.
 *
 * Prisma and requireFastAuth are mocked so no DB server is needed.
 * The five cases cover: unauthorized, empty participants, noCursor-only,
 * withCursor-only, and mixed — verifying both the response body and the
 * exact number of directMessage.count calls made.
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test'

const requireFastAuthMock = mock(async () => ({ user: { id: 'user-1' } }))
const findManyMock = mock(async () => [])
const dmCountMock = mock(async () => 0)

mock.module('@/lib/auth/require-fast-auth', () => ({
  requireFastAuth: requireFastAuthMock,
}))

mock.module('@/lib/db', () => ({
  prisma: {
    conversationParticipant: {
      findMany: findManyMock,
    },
    directMessage: {
      count: dmCountMock,
    },
  },
}))

const { GET } = await import('./route')

describe('GET /api/chat/unread', () => {
  beforeEach(() => {
    requireFastAuthMock.mockReset()
    findManyMock.mockReset()
    dmCountMock.mockReset()
    // Default: authenticated as user-1
    requireFastAuthMock.mockImplementation(async () => ({ user: { id: 'user-1' } }))
  })

  it('returns 401 and makes no DB calls when session is null', async () => {
    requireFastAuthMock.mockImplementationOnce(async () => null)

    const res = await GET()

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(findManyMock).not.toHaveBeenCalled()
    expect(dmCountMock).not.toHaveBeenCalled()
  })

  it('returns { unreadCount: 0 } and zero count calls when participants list is empty', async () => {
    findManyMock.mockImplementationOnce(async () => [])

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ unreadCount: 0 })
    expect(dmCountMock).not.toHaveBeenCalled()
  })

  it('makes exactly one count call with conversationId:in shape when all participants have no cursor', async () => {
    findManyMock.mockImplementationOnce(async () => [
      { conversationId: 'conv-a', lastReadAt: null },
      { conversationId: 'conv-b', lastReadAt: null },
    ])
    dmCountMock.mockImplementationOnce(async () => 7)

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ unreadCount: 7 })
    expect(dmCountMock).toHaveBeenCalledTimes(1)
    const [{ where }] = dmCountMock.mock.calls[0] as [{ where: { conversationId: { in: string[] }; senderId: { not: string } } }]
    expect(where.conversationId).toEqual({ in: ['conv-a', 'conv-b'] })
    expect(where.senderId).toEqual({ not: 'user-1' })
    expect(where.OR).toBeUndefined()
  })

  it('makes exactly one count call with OR shape when all participants have a cursor', async () => {
    const ts = new Date('2026-01-01T00:00:00Z')
    findManyMock.mockImplementationOnce(async () => [
      { conversationId: 'conv-x', lastReadAt: ts },
    ])
    dmCountMock.mockImplementationOnce(async () => 3)

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ unreadCount: 3 })
    expect(dmCountMock).toHaveBeenCalledTimes(1)
    const [{ where }] = dmCountMock.mock.calls[0] as [{ where: { senderId: { not: string }; OR: unknown[] } }]
    expect(where.senderId).toEqual({ not: 'user-1' })
    expect(Array.isArray(where.OR)).toBe(true)
    expect(where.OR).toHaveLength(1)
    expect((where.OR as Array<{ conversationId: string; createdAt: { gt: Date } }>)[0]).toEqual({
      conversationId: 'conv-x',
      createdAt: { gt: ts },
    })
  })

  it('makes exactly two count calls in mixed case and sums the results', async () => {
    const ts = new Date('2026-03-15T12:00:00Z')
    findManyMock.mockImplementationOnce(async () => [
      { conversationId: 'conv-no-cursor', lastReadAt: null },
      { conversationId: 'conv-with-cursor', lastReadAt: ts },
    ])
    // First call → noCursor count, second call → withCursor count
    dmCountMock.mockImplementationOnce(async () => 4)
    dmCountMock.mockImplementationOnce(async () => 6)

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ unreadCount: 10 })
    expect(dmCountMock).toHaveBeenCalledTimes(2)
  })
})
