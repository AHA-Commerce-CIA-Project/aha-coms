/**
 * T2.6 — sargable taskToken rewrite: `contains` → `startsWith`.
 *
 * Key invariant: the Prisma query for tasks uses `{ startsWith: q.toUpperCase() }`
 * on taskToken, so a prefix like "ABC-" matches "ABC-12AB" but NOT tokens that
 * merely contain "ABC-" in the middle (e.g. "XY-ABC-99"). Prefix search is
 * correct because taskTokens are uppercase hex strings (e.g. "A1B2C3D4") and
 * users type the beginning of a known token when searching by ID.
 *
 * Prisma and requireFastAuth are mocked so no DB server is needed.
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test'

const requireFastAuthMock = mock(async () => ({ user: { id: 'user-1' } }))
const userFindUniqueMock = mock(async () => ({ teamId: 'team-1', email: 'user@example.com' }))
const channelFindManyMock = mock(async () => [])
const taskFindManyMock = mock(async () => [])

mock.module('@/lib/auth/require-fast-auth', () => ({
  requireFastAuth: requireFastAuthMock,
}))

mock.module('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
    channel: { findMany: channelFindManyMock },
    task: { findMany: taskFindManyMock },
  },
}))

const { GET } = await import('./route')

function makeRequest(q: string): Request {
  return new Request(`http://localhost/api/search?q=${encodeURIComponent(q)}`)
}

describe('GET /api/search — T2.6 taskToken startsWith rewrite', () => {
  beforeEach(() => {
    requireFastAuthMock.mockReset()
    userFindUniqueMock.mockReset()
    channelFindManyMock.mockReset()
    taskFindManyMock.mockReset()

    requireFastAuthMock.mockImplementation(async () => ({ user: { id: 'user-1' } }))
    userFindUniqueMock.mockImplementation(async () => ({
      teamId: 'team-1',
      email: 'user@example.com',
    }))
    channelFindManyMock.mockImplementation(async () => [])
    taskFindManyMock.mockImplementation(async () => [])
  })

  it('returns empty arrays for short queries (< 2 chars)', async () => {
    const res = await GET(makeRequest('A'))
    const body = await res.json()
    expect(body).toEqual({ channels: [], tasks: [] })
    expect(taskFindManyMock).not.toHaveBeenCalled()
  })

  it('passes startsWith with uppercased q to the task taskToken filter', async () => {
    await GET(makeRequest('abc1'))

    expect(taskFindManyMock).toHaveBeenCalledTimes(1)
    const [callArgs] = taskFindManyMock.mock.calls
    const whereOr: Array<Record<string, unknown>> = callArgs[0].where.OR

    // One of the OR branches must be taskToken: { startsWith: 'ABC1' }
    const tokenBranch = whereOr.find(
      (branch) =>
        'taskToken' in branch &&
        typeof branch.taskToken === 'object' &&
        branch.taskToken !== null &&
        'startsWith' in (branch.taskToken as object),
    )
    expect(tokenBranch).toBeDefined()
    expect((tokenBranch!.taskToken as { startsWith: string }).startsWith).toBe('ABC1')
  })

  it('does NOT use contains on taskToken (the non-sargable form)', async () => {
    await GET(makeRequest('abc1'))

    const [callArgs] = taskFindManyMock.mock.calls
    const whereOr: Array<Record<string, unknown>> = callArgs[0].where.OR

    const containsBranch = whereOr.find(
      (branch) =>
        'taskToken' in branch &&
        typeof branch.taskToken === 'object' &&
        branch.taskToken !== null &&
        'contains' in (branch.taskToken as object),
    )
    expect(containsBranch).toBeUndefined()
  })

  it('prefix "ABC-" matches prefix shape but NOT a mid-token occurrence', async () => {
    // This test verifies the semantic contract of the rewrite.
    // We mock taskFindMany to return tasks whose tokens START with the query.
    const prefixToken = 'ABC-12AB'
    const midToken = 'XY-ABC-99' // contains "ABC-" but does not start with it

    taskFindManyMock.mockImplementation(async (args: { where: { OR: Array<{ taskToken?: { startsWith?: string } }> } }) => {
      const tokenBranch = args.where.OR.find((b) => b.taskToken?.startsWith !== undefined)
      const prefix = tokenBranch?.taskToken?.startsWith ?? ''
      // Simulate what Postgres does: return rows where task_token LIKE 'prefix%'
      const candidates = [prefixToken, midToken]
      return candidates
        .filter((t) => t.startsWith(prefix))
        .map((taskToken) => ({ id: 'x', title: 'T', taskToken, status: 'todo', urgency: null, targetChannel: null }))
    })

    const res = await GET(makeRequest('ABC-'))
    const body = await res.json()
    const tokens: string[] = body.tasks.map((t: { taskToken: string }) => t.taskToken)

    expect(tokens).toContain(prefixToken)
    expect(tokens).not.toContain(midToken)
  })
})
