/**
 * T1.15 — N+1 fixes in sync-hr:
 *   (a) Team lookup is batched via a single team.findMany before the loop.
 *   (b) Per-employee user updates are batched into one user.updateMany per
 *       distinct target teamId instead of one user.update per employee.
 *
 * T1.17 — team.findMany uses a select projection (id + name only).
 *
 * Key invariants:
 *   - user.update is never called (batched into updateMany).
 *   - user.updateMany is called at most once per distinct target teamId.
 *   - team.findMany is called once with a select: { id, name } projection.
 *
 * Prisma, requireFastAuth, and fetchHRSheetData are mocked so no DB
 * server or Google Sheets connection is needed.
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test'

const requireFastAuthMock = mock(async () => ({ user: { id: 'admin-1', role: 'admin' } }))
const userFindUniqueMock = mock(async () => ({ role: 'admin' }))
const teamFindManyMock = mock(async () => [] as { id: string; name: string }[])
const teamCreateMock = mock(async (args: { data: { name: string } }) => ({ id: 'new-team', name: args.data.name }))
const userFindManyMock = mock(async () => [] as { id: string; name: string; teamId: string | null }[])
const userUpdateMock = mock(async () => ({}))
const userUpdateManyMock = mock(async () => ({ count: 0 }))

const fetchHRSheetDataMock = mock(async () => [] as { name: string; team: string }[])

mock.module('@/lib/auth/require-fast-auth', () => ({
  requireFastAuth: requireFastAuthMock,
}))

mock.module('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: userFindUniqueMock,
      findMany: userFindManyMock,
      update: userUpdateMock,
      updateMany: userUpdateManyMock,
    },
    team: {
      findMany: teamFindManyMock,
      create: teamCreateMock,
    },
  },
}))

mock.module('@/lib/google-sheets', () => ({
  fetchHRSheetData: fetchHRSheetDataMock,
}))

const { POST } = await import('./route')

describe('POST /api/admin/sync-hr — T1.15 batched team + employee updates', () => {
  beforeEach(() => {
    requireFastAuthMock.mockReset()
    userFindUniqueMock.mockReset()
    teamFindManyMock.mockReset()
    teamCreateMock.mockReset()
    userFindManyMock.mockReset()
    userUpdateMock.mockReset()
    userUpdateManyMock.mockReset()
    fetchHRSheetDataMock.mockReset()

    requireFastAuthMock.mockImplementation(async () => ({ user: { id: 'admin-1', role: 'admin' } }))
    userFindUniqueMock.mockImplementation(async () => ({ role: 'admin' }))
    teamFindManyMock.mockImplementation(async () => [])
    teamCreateMock.mockImplementation(async (args: unknown) => {
      const a = args as { data: { name: string } }
      return { id: `team-${a.data.name}`, name: a.data.name }
    })
    userFindManyMock.mockImplementation(async () => [])
    userUpdateMock.mockImplementation(async () => ({}))
    userUpdateManyMock.mockImplementation(async () => ({ count: 0 }))
    fetchHRSheetDataMock.mockImplementation(async () => [])
  })

  it('returns 401 when unauthenticated', async () => {
    requireFastAuthMock.mockImplementationOnce(async () => null)
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('returns warning when sheet has no data', async () => {
    fetchHRSheetDataMock.mockImplementationOnce(async () => [])
    const res = await POST()
    expect(res.status).toBe(200)
    const body = await res.json() as { status: string }
    expect(body.status).toBe('warning')
  })

  it('team.findMany is called exactly once with a select projection containing id and name (T1.15a + T1.17)', async () => {
    fetchHRSheetDataMock.mockImplementationOnce(async () => [
      { name: 'Alice', team: 'CS' },
      { name: 'Bob', team: 'FBI' },
    ])
    userFindManyMock.mockImplementation(async () => [])
    teamFindManyMock.mockImplementationOnce(async () => [
      { id: 'team-cs', name: 'Customer Service (CS)' },
      { id: 'team-fbi', name: 'Factual Business Intelligence (FBI)' },
    ])

    await POST()

    expect(teamFindManyMock).toHaveBeenCalledTimes(1)
    const [teamArgs] = teamFindManyMock.mock.calls[0] as [{ select?: { id: boolean; name: boolean } }]
    // Must use select projection — not a full findMany without select.
    expect(teamArgs.select).toBeDefined()
    expect(teamArgs.select?.id).toBe(true)
    expect(teamArgs.select?.name).toBe(true)
  })

  it('does NOT call user.update at all — batches via user.updateMany (T1.15b)', async () => {
    fetchHRSheetDataMock.mockImplementationOnce(async () => [
      { name: 'alice smith', team: 'CS' },
      { name: 'bob jones', team: 'CS' },
      { name: 'carol brown', team: 'FBI' },
    ])
    teamFindManyMock.mockImplementationOnce(async () => [
      { id: 'team-cs', name: 'Customer Service (CS)' },
      { id: 'team-fbi', name: 'Factual Business Intelligence (FBI)' },
    ])
    userFindManyMock.mockImplementationOnce(async () => [
      { id: 'u1', name: 'Alice Smith', teamId: 'team-old' },
      { id: 'u2', name: 'Bob Jones', teamId: 'team-old' },
      { id: 'u3', name: 'Carol Brown', teamId: 'team-old' },
    ])

    await POST()

    // user.update must never be called (the N+1 method).
    expect(userUpdateMock).not.toHaveBeenCalled()
    // user.updateMany must be called (the batched method).
    expect(userUpdateManyMock).toHaveBeenCalled()
  })

  it('issues exactly ONE user.updateMany for 3 employees moving to the same team', async () => {
    fetchHRSheetDataMock.mockImplementationOnce(async () => [
      { name: 'alice smith', team: 'CS' },
      { name: 'bob jones', team: 'CS' },
      { name: 'carol brown', team: 'CS' },
    ])
    teamFindManyMock.mockImplementationOnce(async () => [
      { id: 'team-cs', name: 'Customer Service (CS)' },
    ])
    userFindManyMock.mockImplementationOnce(async () => [
      { id: 'u1', name: 'Alice Smith', teamId: 'team-old' },
      { id: 'u2', name: 'Bob Jones', teamId: 'team-old' },
      { id: 'u3', name: 'Carol Brown', teamId: 'team-old' },
    ])
    userUpdateManyMock.mockImplementationOnce(async () => ({ count: 3 }))

    await POST()

    // All 3 users move to the same team → exactly 1 updateMany call.
    expect(userUpdateManyMock).toHaveBeenCalledTimes(1)
    const [updateArgs] = userUpdateManyMock.mock.calls[0] as [{ where: { id: { in: string[] } }; data: { teamId: string } }]
    expect(updateArgs.where.id.in).toHaveLength(3)
    expect(updateArgs.data.teamId).toBe('team-cs')
  })

  it('issues 2 user.updateMany calls for employees moving to 2 different teams', async () => {
    fetchHRSheetDataMock.mockImplementationOnce(async () => [
      { name: 'alice smith', team: 'CS' },
      { name: 'bob jones', team: 'FBI' },
    ])
    teamFindManyMock.mockImplementationOnce(async () => [
      { id: 'team-cs', name: 'Customer Service (CS)' },
      { id: 'team-fbi', name: 'Factual Business Intelligence (FBI)' },
    ])
    userFindManyMock.mockImplementationOnce(async () => [
      { id: 'u1', name: 'Alice Smith', teamId: 'team-old' },
      { id: 'u2', name: 'Bob Jones', teamId: 'team-old' },
    ])
    userUpdateManyMock
      .mockImplementationOnce(async () => ({ count: 1 }))
      .mockImplementationOnce(async () => ({ count: 1 }))

    await POST()

    // Two distinct target teams → 2 updateMany calls, not 2 update calls.
    expect(userUpdateManyMock).toHaveBeenCalledTimes(2)
    expect(userUpdateMock).not.toHaveBeenCalled()
  })
})
