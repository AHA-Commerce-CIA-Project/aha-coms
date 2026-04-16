import { beforeEach, describe, expect, mock, test } from 'bun:test'

const identityUsers = { id: 'identityUsers.id' }
const teamMembers = { teamId: 'teamMembers.teamId', userId: 'teamMembers.userId' }

const eq = (left: unknown, right: unknown) => ({ left, right })

const operationLog: string[] = []
const resolveAndSyncClaims = mock(async () => {
  operationLog.push('sync:claims')
})
const createGipUser = mock(async () => {
  operationLog.push('gip:create')
  return 'gip-user-1'
})
const setGipUserDisabled = mock(async () => {
  operationLog.push('gip:disable')
})
const generatePasswordResetLink = mock(async () => {
  operationLog.push('gip:reset-email')
  return 'https://reset-link'
})

const transactionCalls: string[] = []
const insertedValues: Array<Record<string, unknown>> = []
const updatedPayloads: Array<Record<string, unknown>> = []
let currentUser: Record<string, unknown> | null = null

const tx = {
  insert(table: unknown) {
    return {
      values(value: Record<string, unknown>) {
        insertedValues.push(value)

        if (table === identityUsers) {
          transactionCalls.push('insert:user')
          operationLog.push('insert:user')
          currentUser = {
            id: 'user-1',
            email: value.email,
            name: value.name,
            gipUid: null,
            portalRole: value.portalRole,
            status: 'active',
            provisioningStatus: value.provisioningStatus,
            provisioningError: value.provisioningError,
          }
          return {
            returning: async () => [{ id: 'user-1' }],
          }
        }

        if (table === teamMembers) {
          transactionCalls.push('insert:teamMember')
          operationLog.push('insert:teamMember')
          return Promise.resolve()
        }

        throw new Error('Unexpected transaction insert target')
      },
    }
  },
}

const db = {
  transaction: async (callback: (trx: typeof tx) => Promise<unknown>) => callback(tx),
  query: {
    identityUsers: {
      findFirst: async () => currentUser,
    },
  },
  update: (_table: unknown) => ({
    set(payload: Record<string, unknown>) {
      updatedPayloads.push(payload)
      currentUser = currentUser ? { ...currentUser, ...payload } : currentUser
      return {
        where: async (_condition: unknown) => undefined,
      }
    },
  }),
  delete: (_table: unknown) => ({
    where: async (_condition: unknown) => {
      currentUser = null
    },
  }),
}

mock.module('~/db', () => ({ db }))
mock.module('~/db/schema', () => {
  return {
    identityUsers,
    teamMembers,
    appRegistry: { id: 'appRegistry.id' },
    teams: { id: 'teams.id' },
    teamAppAccess: { id: 'teamAppAccess.id' },
    accessAuditLog: { actorId: 'accessAuditLog.actorId' },
  }
})
mock.module('drizzle-orm', () => {
  return {
    eq,
    inArray: (left: unknown, right: unknown) => ({ left, right }),
  }
})
mock.module('../claims', () => ({ resolveAndSyncClaims }))
mock.module('../../gip-admin', () => ({
  createGipUser,
  setGipUserDisabled,
  generatePasswordResetLink,
}))

const { createEmployee } = await import('../employees')

describe('createEmployee', () => {
  beforeEach(() => {
    operationLog.length = 0
    transactionCalls.length = 0
    insertedValues.length = 0
    updatedPayloads.length = 0
    currentUser = null

    resolveAndSyncClaims.mockClear()
    createGipUser.mockClear()
    setGipUserDisabled.mockClear()
    generatePasswordResetLink.mockClear()
  })

  test('adds team membership before syncing claims', async () => {
    const result = await createEmployee({
      email: 'new.user@ahacommerce.net',
      name: 'New User',
      teamId: 'team-1',
    })

    expect(result).toEqual({
      id: 'user-1',
      provisioningStatus: 'ready',
    })
    expect(transactionCalls).toEqual(['insert:user', 'insert:teamMember'])
    expect(operationLog.slice(0, 3)).toEqual([
      'insert:user',
      'insert:teamMember',
      'gip:create',
    ])
  })

  test('marks provisioning as failed when GIP user creation fails', async () => {
    createGipUser.mockImplementationOnce(async () => {
      throw new Error('GIP create failed')
    })

    const result = await createEmployee({
      email: 'broken.user@ahacommerce.net',
      name: 'Broken User',
    })

    expect(result).toEqual({
      id: 'user-1',
      provisioningStatus: 'failed',
      provisioningError: 'GIP create failed',
    })
    expect(currentUser).toMatchObject({
      provisioningStatus: 'failed',
      provisioningError: 'GIP create failed',
    })
    expect(setGipUserDisabled).not.toHaveBeenCalled()
  })

  test('disables the provisioned GIP user and marks provisioning failed on downstream failure', async () => {
    generatePasswordResetLink.mockImplementationOnce(async () => {
      throw new Error('Reset email failed')
    })

    const result = await createEmployee({
      email: 'partial.user@ahacommerce.net',
      name: 'Partial User',
    })

    expect(result).toEqual({
      id: 'user-1',
      provisioningStatus: 'failed',
      provisioningError: 'Reset email failed',
    })
    expect(setGipUserDisabled).toHaveBeenCalledWith('gip-user-1', true)
    expect(currentUser).toMatchObject({
      provisioningStatus: 'failed',
      provisioningError: 'Reset email failed',
    })
  })
})
