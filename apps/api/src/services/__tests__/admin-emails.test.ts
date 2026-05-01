/**
 * Unit tests for services/admin-emails.ts (PR D, Spec 06 — admin email management).
 */

process.env.MAIL_TRANSPORT = 'memory'
delete process.env.NODE_ENV

import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { fullDrizzleOrmMock, fullSchemaBarrelMock } from '~/test-helpers/schema-barrel-mock'

const identityUserEmails = {
  id: 'identityUserEmails.id',
  identityUserId: 'identityUserEmails.identityUserId',
  email: 'identityUserEmails.email',
  emailNormalized: 'identityUserEmails.emailNormalized',
  kind: 'identityUserEmails.kind',
  isPrimary: 'identityUserEmails.isPrimary',
  verifiedAt: 'identityUserEmails.verifiedAt',
  addedBy: 'identityUserEmails.addedBy',
  createdAt: 'identityUserEmails.createdAt',
  updatedAt: 'identityUserEmails.updatedAt',
}

const identityUsers = {
  id: 'identityUsers.id',
  name: 'identityUsers.name',
}

type EmailRow = {
  id: string
  identityUserId: string
  email: string
  emailNormalized: string
  kind: 'workspace' | 'personal'
  isPrimary: boolean
  verifiedAt: Date | null
  addedBy: string
}

type UserRow = { id: string; name: string }

let emailStore: EmailRow[] = []
let userStore: UserRow[] = []
let nextEmailId = 1

// Track which select-from is currently being chained so we can route lookup paths.
let currentTable: unknown = null

function makeDb() {
  return {
    insert: (table: unknown) => ({
      values: (value: Record<string, unknown>) => ({
        returning: async () => {
          if (table === identityUserEmails) {
            const id = `email-${nextEmailId++}`
            emailStore.push({
              id,
              identityUserId: value.identityUserId as string,
              email: value.email as string,
              emailNormalized: value.emailNormalized as string,
              kind: value.kind as 'workspace' | 'personal',
              isPrimary: (value.isPrimary as boolean) ?? false,
              verifiedAt: (value.verifiedAt as Date | null) ?? null,
              addedBy: value.addedBy as string,
            })
            return [{ id }]
          }
          return []
        },
      }),
    }),

    select: (_fields: unknown) => ({
      from: (table: unknown) => {
        currentTable = table
        return {
          where: (predicate: unknown) => {
            const predStr = JSON.stringify(predicate ?? {})
            const hasNe = predStr.includes('"ne"')
            return {
              limit: async (_n: number) => {
                if (table === identityUsers) {
                  return userStore.length > 0 ? [userStore[0]] : []
                }
                if (table === identityUserEmails) {
                  if (hasNe) {
                    // last-verified guard: anything verified except current row
                    const others = emailStore.filter(
                      (r) => r.verifiedAt !== null && r.id !== emailStore[0]?.id,
                    )
                    return others.length > 0 ? [others[0]] : []
                  }
                  return emailStore.length > 0 ? [emailStore[0]] : []
                }
                return []
              },
              // No-limit chain (used by adminAddEmailToUser to fetch all rows for a user)
              then: (resolve: (v: unknown) => void) => {
                if (table === identityUserEmails) {
                  resolve(emailStore.filter((r) => r.identityUserId === emailStore[0]?.identityUserId || emailStore[0] == null ? true : true))
                } else {
                  resolve([])
                }
              },
            }
          },
        }
      },
    }),

    update: (table: unknown) => ({
      set: (setValues: Record<string, unknown>) => ({
        where: async (_cond: unknown) => {
          if (table === identityUserEmails) {
            for (const row of emailStore) {
              if (setValues.isPrimary !== undefined) row.isPrimary = setValues.isPrimary as boolean
              if (setValues.verifiedAt !== undefined) row.verifiedAt = setValues.verifiedAt as Date
              if (setValues.email !== undefined) {
                row.email = setValues.email as string
                row.emailNormalized = setValues.emailNormalized as string
              }
            }
          }
        },
      }),
    }),

    delete: (table: unknown) => ({
      where: async (_cond: unknown) => {
        if (table === identityUserEmails && emailStore.length > 0) {
          emailStore.shift()
        }
      },
    }),

    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb(makeDb())
    },
  }
}

let db = makeDb()

mock.module('~/db', () => ({ db }))
mock.module('~/db/schema', () => ({ ...fullSchemaBarrelMock(), identityUserEmails, identityUsers }))
mock.module('~/db/schema/identity-user-emails', () => ({ identityUserEmails }))
mock.module('~/db/schema/identity-users', () => ({ identityUsers }))
mock.module('drizzle-orm', () => fullDrizzleOrmMock())
mock.module('~/logger', () => ({ logger: { info: () => {}, error: () => {}, warn: () => {} } }))

const {
  adminAddEmailToUser,
  adminEditEmailAddress,
  adminSetEmailPrimary,
  adminRemoveEmail,
} = await import('../admin-emails')

beforeEach(() => {
  emailStore = []
  userStore = [{ id: 'user-target', name: 'Target User' }]
  nextEmailId = 1
  currentTable = null
  db = makeDb()
  mock.module('~/db', () => ({ db }))
})

function seedRow(o: Partial<EmailRow> = {}): EmailRow {
  const row: EmailRow = {
    id: o.id ?? `email-${emailStore.length + 1}`,
    identityUserId: 'user-target',
    email: 'a@example.com',
    emailNormalized: 'a@example.com',
    kind: 'personal',
    isPrimary: false,
    verifiedAt: new Date(),
    addedBy: 'admin',
    ...o,
  }
  emailStore.push(row)
  return row
}

// ---------------------------------------------------------------------------

describe('adminAddEmailToUser', () => {
  test('adds personal email to user with no prior emails as primary, verifiedAt=NOW(), addedBy=admin', async () => {
    const result = await adminAddEmailToUser({
      targetIdentityUserId: 'user-target',
      email: 'new@example.com',
      kind: 'personal',
    })
    expect(result.outcome).toBe('added')
    if (result.outcome === 'added') {
      expect(result.isPrimary).toBe(true)
    }
    expect(emailStore).toHaveLength(1)
    expect(emailStore[0].verifiedAt).toBeInstanceOf(Date)
    expect(emailStore[0].addedBy).toBe('admin')
    expect(emailStore[0].kind).toBe('personal')
  })

  test('collision returns target user id and name (admin sees who owns it)', async () => {
    seedRow({ identityUserId: 'someone-else', email: 'taken@example.com', emailNormalized: 'taken@example.com' })
    userStore = [{ id: 'someone-else', name: 'Other Carol' }]
    const result = await adminAddEmailToUser({
      targetIdentityUserId: 'user-target',
      email: 'taken@example.com',
      kind: 'personal',
    })
    expect(result.outcome).toBe('email_in_use')
    if (result.outcome === 'email_in_use') {
      expect(result.collisionUserId).toBe('someone-else')
      expect(result.collisionUserName).toBe('Other Carol')
    }
  })

  test('target_user_not_found short-circuits before insert', async () => {
    userStore = []
    const result = await adminAddEmailToUser({
      targetIdentityUserId: 'ghost',
      email: 'new@example.com',
      kind: 'personal',
    })
    expect(result.outcome).toBe('target_user_not_found')
    expect(emailStore).toHaveLength(0)
  })

  test('email is normalized for storage', async () => {
    const result = await adminAddEmailToUser({
      targetIdentityUserId: 'user-target',
      email: '  NEW@Example.com  ',
      kind: 'personal',
    })
    expect(result.outcome).toBe('added')
    expect(emailStore[0].emailNormalized).toBe('new@example.com')
  })
})

describe('adminEditEmailAddress', () => {
  test('updates email address when no collision', async () => {
    seedRow({ id: 'email-1' })
    const result = await adminEditEmailAddress({
      targetIdentityUserId: 'user-target',
      emailId: 'email-1',
      newEmail: 'changed@example.com',
    })
    expect(result.outcome).toBe('updated')
    expect(emailStore[0].emailNormalized).toBe('changed@example.com')
  })

  test('wrong_target_user blocks editing across users', async () => {
    seedRow({ id: 'email-1', identityUserId: 'someone-else' })
    const result = await adminEditEmailAddress({
      targetIdentityUserId: 'user-target',
      emailId: 'email-1',
      newEmail: 'foo@example.com',
    })
    expect(result.outcome).toBe('wrong_target_user')
  })
})

describe('adminRemoveEmail', () => {
  test('refuses last verified email', async () => {
    seedRow({ id: 'email-1', verifiedAt: new Date() })
    const result = await adminRemoveEmail({
      targetIdentityUserId: 'user-target',
      emailId: 'email-1',
    })
    expect(result.outcome).toBe('last_verified_email')
    expect(emailStore).toHaveLength(1)
  })

  test('admin CAN remove workspace-kind rows (unlike self-service)', async () => {
    // Admin can remove a workspace row when a verified personal exists.
    // Seed a verified personal first so the last_verified_email guard does not trip.
    seedRow({ id: 'email-1', kind: 'workspace', verifiedAt: new Date() })
    seedRow({ id: 'email-2', kind: 'personal', verifiedAt: new Date() })
    const result = await adminRemoveEmail({
      targetIdentityUserId: 'user-target',
      emailId: 'email-1',
    })
    expect(result.outcome).toBe('removed')
  })

  test('removes unverified row even if it is the only row', async () => {
    seedRow({ id: 'email-1', verifiedAt: null })
    const result = await adminRemoveEmail({
      targetIdentityUserId: 'user-target',
      emailId: 'email-1',
    })
    expect(result.outcome).toBe('removed')
  })
})

describe('adminSetEmailPrimary', () => {
  test('not_verified blocks promoting unverified row', async () => {
    seedRow({ id: 'email-1', verifiedAt: null })
    const result = await adminSetEmailPrimary({
      targetIdentityUserId: 'user-target',
      emailId: 'email-1',
    })
    expect(result.outcome).toBe('not_verified')
  })

  test('happy path promotes verified row', async () => {
    seedRow({ id: 'email-1', verifiedAt: new Date(), isPrimary: false })
    const result = await adminSetEmailPrimary({
      targetIdentityUserId: 'user-target',
      emailId: 'email-1',
    })
    expect(result.outcome).toBe('updated')
  })
})
