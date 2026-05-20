/**
 * T1.12 — N+1 fix: unread counts for DM conversations are now loaded with
 * a batched groupBy instead of one count() call per conversation.
 *
 * The key invariant: for N conversations the route must issue at most
 * TWO directMessage DB calls total (one groupBy for no-cursor convs,
 * one groupBy for with-cursor convs) regardless of how many conversations
 * are returned — never one call per conversation.
 *
 * Prisma and requireFastAuth are mocked so no DB server is needed.
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test'

const requireFastAuthMock = mock(async () => ({ user: { id: 'user-1' } }))
const convFindManyMock = mock(async () => [])
const dmGroupByMock = mock(async () => [])

mock.module('@/lib/auth/require-fast-auth', () => ({
  requireFastAuth: requireFastAuthMock,
}))

mock.module('@/lib/db', () => ({
  prisma: {
    conversation: {
      findMany: convFindManyMock,
    },
    directMessage: {
      groupBy: dmGroupByMock,
    },
  },
}))

const { GET } = await import('./route')

function makeConv(id: string, lastReadAt: Date | null = null) {
  return {
    id,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    participants: [
      { userId: 'user-1', lastReadAt, user: { id: 'user-1', name: 'Me', image: null, email: 'me@x.com', lastSeenAt: null, role: 'member', team: null } },
      { userId: 'user-2', lastReadAt: null, user: { id: 'user-2', name: 'Them', image: null, email: 'them@x.com', lastSeenAt: null, role: 'member', team: null } },
    ],
    messages: [],
  }
}

describe('GET /api/chat/conversations — T1.12 batched unread counts', () => {
  beforeEach(() => {
    requireFastAuthMock.mockReset()
    convFindManyMock.mockReset()
    dmGroupByMock.mockReset()
    requireFastAuthMock.mockImplementation(async () => ({ user: { id: 'user-1' } }))
    convFindManyMock.mockImplementation(async () => [])
    dmGroupByMock.mockImplementation(async () => [])
  })

  it('returns 401 when unauthenticated', async () => {
    requireFastAuthMock.mockImplementationOnce(async () => null)
    const res = await GET()
    expect(res.status).toBe(401)
    expect(dmGroupByMock).not.toHaveBeenCalled()
  })

  it('makes zero directMessage DB calls when there are no conversations', async () => {
    convFindManyMock.mockImplementationOnce(async () => [])
    await GET()
    expect(dmGroupByMock).toHaveBeenCalledTimes(0)
  })

  it('makes exactly ONE groupBy call for 3 no-cursor conversations (not 3 separate calls)', async () => {
    convFindManyMock.mockImplementationOnce(async () => [
      makeConv('conv-a', null),
      makeConv('conv-b', null),
      makeConv('conv-c', null),
    ])
    dmGroupByMock.mockImplementationOnce(async () => [
      { conversationId: 'conv-a', _count: { id: 2 } },
      { conversationId: 'conv-b', _count: { id: 0 } },
    ])

    const res = await GET()

    expect(res.status).toBe(200)
    // Only 1 groupBy call for all 3 no-cursor conversations — not 3 separate count() calls.
    expect(dmGroupByMock).toHaveBeenCalledTimes(1)
    const [args] = dmGroupByMock.mock.calls[0] as [{ by: string[]; where: { conversationId: { in: string[] } } }]
    expect(args.by).toContain('conversationId')
    expect(args.where.conversationId).toEqual({ in: expect.arrayContaining(['conv-a', 'conv-b', 'conv-c']) })
  })

  it('makes exactly ONE groupBy call for 2 with-cursor conversations using OR shape', async () => {
    const ts1 = new Date('2026-01-01T10:00:00Z')
    const ts2 = new Date('2026-01-02T10:00:00Z')
    convFindManyMock.mockImplementationOnce(async () => [
      makeConv('conv-x', ts1),
      makeConv('conv-y', ts2),
    ])
    dmGroupByMock.mockImplementationOnce(async () => [
      { conversationId: 'conv-x', _count: { id: 3 } },
    ])

    const res = await GET()

    expect(res.status).toBe(200)
    expect(dmGroupByMock).toHaveBeenCalledTimes(1)
    const [args] = dmGroupByMock.mock.calls[0] as [{ where: { OR: unknown[] } }]
    expect(Array.isArray(args.where.OR)).toBe(true)
    expect(args.where.OR).toHaveLength(2)
  })

  it('makes at most 2 groupBy calls for a mix of cursor/no-cursor conversations', async () => {
    const ts = new Date('2026-03-01T00:00:00Z')
    convFindManyMock.mockImplementationOnce(async () => [
      makeConv('conv-1', null),
      makeConv('conv-2', ts),
      makeConv('conv-3', null),
    ])
    dmGroupByMock
      .mockImplementationOnce(async () => [{ conversationId: 'conv-1', _count: { id: 1 } }])
      .mockImplementationOnce(async () => [{ conversationId: 'conv-2', _count: { id: 2 } }])

    const res = await GET()

    expect(res.status).toBe(200)
    // At most 2 calls: one for no-cursor bucket, one for with-cursor bucket.
    expect(dmGroupByMock).toHaveBeenCalledTimes(2)
  })

  it('response preserves unreadCount from groupBy result', async () => {
    convFindManyMock.mockImplementationOnce(async () => [makeConv('conv-a', null)])
    dmGroupByMock.mockImplementationOnce(async () => [
      { conversationId: 'conv-a', _count: { id: 5 } },
    ])

    const res = await GET()
    const body = (await res.json()) as Array<{ id: string; unreadCount: number }>

    expect(body).toHaveLength(1)
    expect(body[0]?.unreadCount).toBe(5)
  })
})
