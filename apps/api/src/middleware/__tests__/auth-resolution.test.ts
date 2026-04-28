import { beforeEach, describe, expect, mock, test } from 'bun:test'

const findFirst = mock(async () => ({
  id: 'user-123',
  gipUid: 'gip-123',
  email: 'handers.the@ahacommerce.net',
  name: 'Handers',
  portalRole: 'admin',
  status: 'active',
}))

// Track what select().from().where() chains return
let selectResults: Record<string, unknown[]> = {}

function makeSelectChain() {
  let tableName = ''
  return {
    from: (table: { teamId?: string; appId?: string; slug?: string }) => {
      if (table.teamId) tableName = 'teamMembers'
      else if (table.appId) tableName = 'teamAppAccess'
      else tableName = 'appRegistry'
      return {
        where: async () => selectResults[tableName] ?? [],
      }
    },
  }
}

mock.module('~/db', () => ({
  db: {
    query: {
      identityUsers: {
        findFirst,
      },
    },
    select: () => makeSelectChain(),
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
    // Added in the SSO upgrade — barrel re-exports these new schema tables
    sessionRevocations: { userId: 'sessionRevocations.userId' },
    appWebhookEndpoints: { id: 'appWebhookEndpoints.id' },
    memberAppRole: { userId: 'memberAppRole.userId', appId: 'memberAppRole.appId', appRole: 'memberAppRole.appRole' },
    // Rev 3 additions — included so this mock doesn't break downstream test files
    appUserConfig: { portalSub: 'auc.portalSub', appId: 'auc.appId', config: 'auc.config', schemaVersion: 'auc.schemaVersion', updatedAt: 'auc.updatedAt', updatedBy: 'auc.updatedBy' },
    appManifests: { appId: 'am.appId', displayName: 'am.displayName', schemaVersion: 'am.schemaVersion', configSchema: 'am.configSchema' },
    bulkEditLocks: { appId: 'bel.appId', acquiredBy: 'bel.acquiredBy', acquiredAt: 'bel.acquiredAt' },
    aliasCollisionQueue: { id: 'acq.id', rawName: 'acq.rawName', rawNameNormalized: 'acq.rawNameNormalized', status: 'acq.status', createdAt: 'acq.createdAt' },
    userAliases: { id: 'ua.id', identityUserId: 'ua.identityUserId', alias: 'ua.alias', aliasNormalized: 'ua.aliasNormalized', isPrimary: 'ua.isPrimary', source: 'ua.source', tombstoned: 'ua.tombstoned', createdAt: 'ua.createdAt' },
    signingKeys: { kid: 'sk.kid', publicKey: 'sk.publicKey', privateKey: 'sk.privateKey', algorithm: 'sk.algorithm', status: 'sk.status', createdAt: 'sk.createdAt' },
    authHandoffs: { id: 'ah.id', nonce: 'ah.nonce', state: 'ah.state', expiresAt: 'ah.expiresAt' },
    webhookDeliveryJobs: { id: 'wdj.id', endpointId: 'wdj.endpointId', payload: 'wdj.payload', status: 'wdj.status', scheduledAt: 'wdj.scheduledAt' },
  }
})

mock.module('drizzle-orm', () => {
  return {
    eq: (left: unknown, right: unknown) => ({ left, right }),
    inArray: (left: unknown, right: unknown) => ({ left, right }),
    // sql and relations needed by the schema barrel's new re-exports
    sql: new Proxy(
      (strings: TemplateStringsArray) => strings.join(''),
      { get: (_t, prop) => prop },
    ),
    relations: () => ({}),
    and: (...conditions: unknown[]) => ({ conditions }),
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
    selectResults = {
      teamMembers: [{ teamId: 'team-1' }],
      teamAppAccess: [{ appId: 'app-1' }],
      appRegistry: [{ slug: 'portal' }],
    }
  })

  test('returns the DB-backed auth user with teams and apps resolved from DB', async () => {
    const authUser = await resolveAuthUser({
      uid: 'gip-123',
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

  test('returns empty apps when user has no team memberships', async () => {
    selectResults = { teamMembers: [], teamAppAccess: [], appRegistry: [] }

    const authUser = await resolveAuthUser({ uid: 'gip-123' })

    expect(authUser.teamIds).toEqual([])
    expect(authUser.apps).toEqual([])
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
