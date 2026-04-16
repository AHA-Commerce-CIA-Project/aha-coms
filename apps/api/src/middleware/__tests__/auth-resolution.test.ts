import { beforeEach, describe, expect, mock, test } from 'bun:test'

const findFirst = mock(async () => ({
  id: 'user-123',
  gipUid: 'gip-123',
  email: 'handers.the@ahacommerce.net',
  name: 'Handers',
  portalRole: 'admin',
  status: 'active',
}))

mock.module('~/db', () => ({
  db: {
    query: {
      identityUsers: {
        findFirst,
      },
    },
    transaction: async () => undefined,
    update: () => ({
      set: () => ({
        where: async () => undefined,
      }),
    }),
    delete: () => ({
      where: async () => undefined,
    }),
  },
}))

mock.module('~/db/schema', () => {
  return {
    identityUsers: {
      id: 'identityUsers.id',
      gipUid: 'gip_uid',
    },
    teamMembers: { teamId: 'teamMembers.teamId', userId: 'teamMembers.userId' },
    appRegistry: { id: 'appRegistry.id' },
    teams: { id: 'teams.id' },
    teamAppAccess: { id: 'teamAppAccess.id' },
    accessAuditLog: { actorId: 'accessAuditLog.actorId' },
  }
})

mock.module('drizzle-orm', () => {
  return {
    eq: (left: unknown, right: unknown) => ({ left, right }),
    inArray: (left: unknown, right: unknown) => ({ left, right }),
  }
})

const { AuthResolutionError, resolveAuthUser } = await import('../auth')

describe('resolveAuthUser', () => {
  beforeEach(() => {
    findFirst.mockClear()
    findFirst.mockImplementation(async () => ({
      id: 'user-123',
      gipUid: 'gip-123',
      email: 'handers.the@ahacommerce.net',
      name: 'Handers',
      portalRole: 'admin',
      status: 'active',
    }))
  })

  test('returns the DB-backed auth user with claims from the decoded cookie', async () => {
    const authUser = await resolveAuthUser({
      uid: 'gip-123',
      teamIds: ['team-1'],
      apps: ['portal'],
    })

    expect(findFirst).toHaveBeenCalledTimes(1)
    expect(authUser).toEqual({
      id: 'user-123',
      gipUid: 'gip-123',
      email: 'handers.the@ahacommerce.net',
      name: 'Handers',
      portalRole: 'admin',
      teamIds: ['team-1'],
      apps: ['portal'],
    })
  })

  test('throws a 403 resolution error for inactive users', async () => {
    findFirst.mockImplementationOnce(async () => ({
      id: 'user-123',
      gipUid: 'gip-123',
      email: 'inactive@ahacommerce.net',
      name: 'Inactive User',
      portalRole: 'employee',
      status: 'inactive',
    }))

    await expect(resolveAuthUser({ uid: 'gip-123' })).rejects.toMatchObject({
      message: 'Account is inactive or suspended',
      statusCode: 403,
    } satisfies Partial<InstanceType<typeof AuthResolutionError>>)
  })
})
