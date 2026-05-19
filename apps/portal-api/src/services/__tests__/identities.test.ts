import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { fullDrizzleOrmMock, fullSchemaBarrelMock } from '~/test-helpers/schema-barrel-mock'

// Same shape-trick used by employees.test.ts: tx.insert(identityUsers) compares
// against this local reference, so the production module must see the same object.
const identityUsers = { id: 'identityUsers.id' }
const identityUserEmails = {
  identityUserId: 'identityUserEmails.identityUserId',
  emailNormalized: 'identityUserEmails.emailNormalized',
  kind: 'identityUserEmails.kind',
}

const operationLog: string[] = []
const insertedValues: Array<{ table: string; value: Record<string, unknown> }> = []
let existingEmail: { id: string } | null = null

const createGipUser = mock(async (_email: string, _password: string) => {
  operationLog.push('gip:create')
  return 'gip-uid-1'
})

const tx = {
  insert(table: unknown) {
    return {
      values(value: Record<string, unknown>) {
        if (table === identityUsers) {
          insertedValues.push({ table: 'identity_users', value })
          operationLog.push('insert:user')
          return {
            returning: async () => [{ id: 'identity-1' }],
          }
        }
        if (table === identityUserEmails) {
          insertedValues.push({ table: 'identity_user_emails', value })
          operationLog.push('insert:email')
          return Promise.resolve()
        }
        // app_user_config seeding — onConflictDoNothing no-op
        return { onConflictDoNothing: async () => undefined }
      },
    }
  },
}

const db = {
  transaction: async (callback: (trx: typeof tx) => Promise<unknown>) => callback(tx),
  select: () => ({
    from: () => ({
      where: () => ({ orderBy: async () => [], limit: async () => [] }),
    }),
  }),
  query: {
    identityUsers: { findFirst: async () => null },
    identityUserEmails: {
      findFirst: async () => existingEmail,
    },
  },
}

mock.module('~/db', () => ({ db }))
mock.module('~/db/schema', () => ({
  ...fullSchemaBarrelMock(),
  identityUsers,
  identityUserEmails,
}))
mock.module('drizzle-orm', () => fullDrizzleOrmMock())

// Stub email-resolution so the post-tx emitUserProvisioned doesn't barf when
// it walks the select chain.
mock.module('../email-resolution', () => ({
  getDisplayEmail: async (_userId: string) =>
    (insertedValues.find((v) => v.table === 'identity_user_emails')?.value.email as string | undefined) ?? null,
  getEmailEntries: async (_userId: string) => [],
}))

// app_user_config seeding calls loadAllManifests; the empty-chain db stub
// returns {} (not iterable), so short-circuit the helper here.
mock.module('../manifests', () => ({
  loadAllManifests: async () => [],
  seedDefaults: () => ({}),
}))

const realGipAdmin = { ...(await import('../../gip-admin')) }
mock.module('../../gip-admin', () => ({
  ...realGipAdmin,
  createGipUser,
}))

const { createIdentityWithPassword, WeakPasswordError, DuplicateEmailError } =
  await import('../identities')

describe('createIdentityWithPassword', () => {
  beforeEach(() => {
    operationLog.length = 0
    insertedValues.length = 0
    existingEmail = null
    createGipUser.mockClear()
  })

  test('happy path — creates GIP user, inserts identity + email with password_only_auth=TRUE', async () => {
    const result = await createIdentityWithPassword({
      name: 'Tools Bot',
      email: 'tools-bot@internal',
      password: 'Aha1234567!Bb',
      notes: 'CI fixture account',
    })

    expect(result).toEqual({ id: 'identity-1', gipUid: 'gip-uid-1' })
    expect(createGipUser).toHaveBeenCalledWith('tools-bot@internal', 'Aha1234567!Bb')

    // Order matters: GIP create first, then in-tx user + email
    expect(operationLog.slice(0, 3)).toEqual(['gip:create', 'insert:user', 'insert:email'])

    const userInsert = insertedValues.find((v) => v.table === 'identity_users')!
    expect(userInsert.value).toMatchObject({
      name: 'Tools Bot',
      gipUid: 'gip-uid-1',
      source: 'manual',
      passwordOnlyAuth: true,
      notes: 'CI fixture account',
    })
    expect(userInsert.value.passwordSetAt).toBeInstanceOf(Date)

    const emailInsert = insertedValues.find((v) => v.table === 'identity_user_emails')!
    expect(emailInsert.value).toMatchObject({
      identityUserId: 'identity-1',
      email: 'tools-bot@internal',
      emailNormalized: 'tools-bot@internal',
      kind: 'personal',
      isPrimary: true,
      addedBy: 'admin',
    })
    expect(emailInsert.value.verifiedAt).toBeInstanceOf(Date)
  })

  test('rejects weak password before calling GIP', async () => {
    await expect(
      createIdentityWithPassword({
        name: 'X',
        email: 'x@y.com',
        password: 'short',
      }),
    ).rejects.toBeInstanceOf(WeakPasswordError)
    expect(createGipUser).not.toHaveBeenCalled()
  })

  test('rejects duplicate email before calling GIP', async () => {
    existingEmail = { id: 'existing' }
    await expect(
      createIdentityWithPassword({
        name: 'Dup',
        email: 'dup@y.com',
        password: 'Aha1234567!Bb',
      }),
    ).rejects.toBeInstanceOf(DuplicateEmailError)
    expect(createGipUser).not.toHaveBeenCalled()
  })

  test('propagates GIP failures (no orphaned local row)', async () => {
    createGipUser.mockImplementationOnce(async () => {
      throw new Error('GIP create failed')
    })
    await expect(
      createIdentityWithPassword({
        name: 'X',
        email: 'x@y.com',
        password: 'Aha1234567!Bb',
      }),
    ).rejects.toThrow('GIP create failed')
    // Neither identity_users nor identity_user_emails were inserted
    expect(insertedValues).toHaveLength(0)
  })

  test('normalises email before storage', async () => {
    await createIdentityWithPassword({
      name: 'X',
      email: '  Admin@Example.COM  ',
      password: 'Aha1234567!Bb',
    })
    const emailInsert = insertedValues.find((v) => v.table === 'identity_user_emails')!
    expect(emailInsert.value.emailNormalized).toBe('admin@example.com')
    expect(emailInsert.value.email).toBe('  Admin@Example.COM  ')
  })
})
