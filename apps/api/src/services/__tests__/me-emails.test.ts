/**
 * Unit tests for services/me-emails.ts (PR D, Spec 06 — self-service email management).
 *
 * Mirrors the in-memory mock pattern from otp-service.test.ts.
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

type EmailRow = {
  id: string
  identityUserId: string
  email: string
  emailNormalized: string
  kind: 'workspace' | 'personal'
  isPrimary: boolean
  verifiedAt: Date | null
  addedBy: string
  createdAt: Date
  updatedAt: Date
}

let emailStore: EmailRow[] = []
let nextEmailId = 1
let lastInsertedRowId: string | null = null
const requestOtpCalls: Array<{ email: string; template?: string }> = []
let verifyOtpResult: { outcome: string; identityUserId?: string; attemptsRemaining?: number } = { outcome: 'verified', identityUserId: 'user-1' }

// Whether the most recent select call had a "not equal id" condition (for the
// "last verified email" check). We track this via the drizzle-orm mock which
// emits structured tags on its predicates.
let lastWhereWasNeFilter = false

// Lookup-by-id state for select chains. The me-emails service queries by row id
// for almost every operation; tests configure emailStore[0] to be the row in question.
function makeDb() {
  return {
    insert: (table: unknown) => ({
      values: (value: Record<string, unknown>) => ({
        returning: async (_proj: unknown) => {
          if (table === identityUserEmails) {
            const id = `email-${nextEmailId++}`
            const row: EmailRow = {
              id,
              identityUserId: value.identityUserId as string,
              email: value.email as string,
              emailNormalized: value.emailNormalized as string,
              kind: value.kind as 'personal' | 'workspace',
              isPrimary: (value.isPrimary as boolean) ?? false,
              verifiedAt: (value.verifiedAt as Date | null) ?? null,
              addedBy: value.addedBy as string,
              createdAt: new Date(),
              updatedAt: new Date(),
            }
            emailStore.push(row)
            lastInsertedRowId = id
            return [{ id }]
          }
          return []
        },
      }),
    }),

    select: (_fields: unknown) => ({
      from: (table: unknown) => ({
        where: (predicate: unknown) => {
          // Detect "ne(id, X)" pattern emitted by the last_verified_email check
          const hasNe = predicate !== null && typeof predicate === 'object' && JSON.stringify(predicate).includes('"ne"')
          lastWhereWasNeFilter = hasNe
          return {
            limit: async (_n: number) => {
              if (table !== identityUserEmails) return []
              if (hasNe) {
                // last-verified-email guard: return any row OTHER than the one being deleted that's verified
                const others = emailStore.filter(
                  (r) => r.verifiedAt !== null && r.identityUserId === emailStore[0]?.identityUserId,
                )
                // Crude — tests that need this populate emailStore with a second row
                return others.length > 1 ? [others[1]] : []
              }
              // Collision check uses email_normalized; row-by-id and other lookups use the first row.
              return emailStore.length > 0 ? [emailStore[0]] : []
            },
          }
        },
      }),
    }),

    update: (table: unknown) => ({
      set: (setValues: Record<string, unknown>) => ({
        where: async (_cond: unknown) => {
          if (table === identityUserEmails) {
            for (const row of emailStore) {
              if (setValues.isPrimary !== undefined) row.isPrimary = setValues.isPrimary as boolean
              if (setValues.verifiedAt !== undefined) row.verifiedAt = setValues.verifiedAt as Date
            }
          }
          return undefined
        },
      }),
    }),

    delete: (table: unknown) => ({
      where: async (_cond: unknown) => {
        if (table === identityUserEmails) {
          // delete the row matched by lastInsertedRowId / emailStore[0]
          if (emailStore.length > 0) emailStore.shift()
        }
        return undefined
      },
    }),

    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = makeDb()
      return cb(tx)
    },
  }
}

let db = makeDb()

mock.module('~/db', () => ({ db }))
mock.module('~/db/schema', () => ({ ...fullSchemaBarrelMock(), identityUserEmails }))
mock.module('~/db/schema/identity-user-emails', () => ({ identityUserEmails }))
mock.module('drizzle-orm', () => fullDrizzleOrmMock())
mock.module('~/logger', () => ({ logger: { info: () => {}, error: () => {}, warn: () => {} } }))

mock.module('../otp', () => ({
  requestOtp: async (args: { email: string; template?: string }) => {
    requestOtpCalls.push(args)
    return { outcome: 'sent' as const }
  },
  verifyOtp: async (_args: { email: string; code: string }) => verifyOtpResult,
}))
mock.module('~/services/otp', () => ({
  requestOtp: async (args: { email: string; template?: string }) => {
    requestOtpCalls.push(args)
    return { outcome: 'sent' as const }
  },
  verifyOtp: async (_args: { email: string; code: string }) => verifyOtpResult,
}))

const {
  addPersonalEmail,
  verifyOwnedEmail,
  resendOwnedEmailOtp,
  setEmailPrimary,
  removeOwnedEmail,
} = await import('../me-emails')

beforeEach(() => {
  emailStore = []
  nextEmailId = 1
  lastInsertedRowId = null
  requestOtpCalls.length = 0
  lastWhereWasNeFilter = false
  verifyOtpResult = { outcome: 'verified', identityUserId: 'user-1' }
  db = makeDb()
  mock.module('~/db', () => ({ db }))
})

function seedRow(overrides: Partial<EmailRow> = {}): EmailRow {
  const row: EmailRow = {
    id: overrides.id ?? `email-seed-${emailStore.length + 1}`,
    identityUserId: 'user-1',
    email: 'alice.personal@example.com',
    emailNormalized: 'alice.personal@example.com',
    kind: 'personal',
    isPrimary: false,
    verifiedAt: null,
    addedBy: 'self',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
  emailStore.push(row)
  return row
}

// ---------------------------------------------------------------------------

describe('addPersonalEmail', () => {
  test('happy path inserts kind=personal row and dispatches verify-template OTP', async () => {
    const result = await addPersonalEmail({
      identityUserId: 'user-1',
      email: 'alice.personal@example.com',
      requestIp: '1.2.3.4',
    })
    expect(result.outcome).toBe('added')
    expect(emailStore).toHaveLength(1)
    expect(emailStore[0].kind).toBe('personal')
    expect(emailStore[0].verifiedAt).toBeNull()
    expect(emailStore[0].addedBy).toBe('self')
    expect(emailStore[0].isPrimary).toBe(false)
    expect(requestOtpCalls).toHaveLength(1)
    expect(requestOtpCalls[0].template).toBe('verify_personal_email')
  })

  test('collision returns email_in_use without leaking owner', async () => {
    seedRow({ identityUserId: 'someone-else', email: 'taken@example.com', emailNormalized: 'taken@example.com' })
    const result = await addPersonalEmail({
      identityUserId: 'user-1',
      email: 'taken@example.com',
      requestIp: '1.2.3.4',
    })
    expect(result.outcome).toBe('email_in_use')
    expect(emailStore).toHaveLength(1) // no insert
    expect(requestOtpCalls).toHaveLength(0)
  })

  test('email is normalized (lowercase + trim) for storage and collision check', async () => {
    const result = await addPersonalEmail({
      identityUserId: 'user-1',
      email: '  Alice.Personal@Example.com  ',
      requestIp: '1.2.3.4',
    })
    expect(result.outcome).toBe('added')
    expect(emailStore[0].emailNormalized).toBe('alice.personal@example.com')
  })
})

describe('verifyOwnedEmail', () => {
  test('happy path returns verified and verifyOtp auto-sets verifiedAt', async () => {
    const row = seedRow({ id: 'email-1' })
    verifyOtpResult = { outcome: 'verified', identityUserId: 'user-1' }
    const result = await verifyOwnedEmail({
      identityUserId: 'user-1',
      emailId: row.id,
      code: '123456',
    })
    expect(result.outcome).toBe('verified')
  })

  test('not_owner when emailId belongs to another user', async () => {
    seedRow({ id: 'email-1', identityUserId: 'someone-else' })
    const result = await verifyOwnedEmail({
      identityUserId: 'user-1',
      emailId: 'email-1',
      code: '123456',
    })
    expect(result.outcome).toBe('not_owner')
  })

  test('invalid code returns invalid_or_expired with attemptsRemaining', async () => {
    seedRow({ id: 'email-1' })
    verifyOtpResult = { outcome: 'invalid_or_expired', attemptsRemaining: 3 }
    const result = await verifyOwnedEmail({
      identityUserId: 'user-1',
      emailId: 'email-1',
      code: '000000',
    })
    expect(result.outcome).toBe('invalid_or_expired')
    if (result.outcome === 'invalid_or_expired') {
      expect(result.attemptsRemaining).toBe(3)
    }
  })

  test('defense-in-depth: rejects when verifyOtp identity does not match owner', async () => {
    seedRow({ id: 'email-1', identityUserId: 'user-1' })
    verifyOtpResult = { outcome: 'verified', identityUserId: 'different-user' }
    const result = await verifyOwnedEmail({
      identityUserId: 'user-1',
      emailId: 'email-1',
      code: '123456',
    })
    expect(result.outcome).toBe('not_owner')
  })
})

describe('removeOwnedEmail', () => {
  test('refuses to remove workspace-kind rows', async () => {
    seedRow({ id: 'email-1', kind: 'workspace', verifiedAt: new Date() })
    const result = await removeOwnedEmail({ identityUserId: 'user-1', emailId: 'email-1' })
    expect(result.outcome).toBe('workspace_kind_forbidden')
    expect(emailStore).toHaveLength(1)
  })

  test('refuses to remove last verified email', async () => {
    seedRow({ id: 'email-1', kind: 'personal', verifiedAt: new Date() })
    const result = await removeOwnedEmail({ identityUserId: 'user-1', emailId: 'email-1' })
    expect(result.outcome).toBe('last_verified_email')
    expect(emailStore).toHaveLength(1)
  })

  test('removes unverified row even if it is the only row', async () => {
    seedRow({ id: 'email-1', kind: 'personal', verifiedAt: null })
    const result = await removeOwnedEmail({ identityUserId: 'user-1', emailId: 'email-1' })
    expect(result.outcome).toBe('removed')
  })

  test('not_owner blocks cross-user delete', async () => {
    seedRow({ id: 'email-1', identityUserId: 'someone-else', kind: 'personal' })
    const result = await removeOwnedEmail({ identityUserId: 'user-1', emailId: 'email-1' })
    expect(result.outcome).toBe('not_owner')
  })
})

describe('setEmailPrimary', () => {
  test('not_verified blocks promoting an unverified row', async () => {
    seedRow({ id: 'email-1', verifiedAt: null })
    const result = await setEmailPrimary({ identityUserId: 'user-1', emailId: 'email-1' })
    expect(result.outcome).toBe('not_verified')
  })

  test('happy path promotes verified row', async () => {
    seedRow({ id: 'email-1', verifiedAt: new Date(), isPrimary: false })
    const result = await setEmailPrimary({ identityUserId: 'user-1', emailId: 'email-1' })
    expect(result.outcome).toBe('set')
  })

  test('not_owner blocks cross-user promote', async () => {
    seedRow({ id: 'email-1', identityUserId: 'someone-else', verifiedAt: new Date() })
    const result = await setEmailPrimary({ identityUserId: 'user-1', emailId: 'email-1' })
    expect(result.outcome).toBe('not_owner')
  })
})

describe('resendOwnedEmailOtp', () => {
  test('already_verified short-circuits; no OTP dispatched', async () => {
    seedRow({ id: 'email-1', verifiedAt: new Date() })
    const result = await resendOwnedEmailOtp({ identityUserId: 'user-1', emailId: 'email-1', requestIp: '1.2.3.4' })
    expect(result.outcome).toBe('already_verified')
    expect(requestOtpCalls).toHaveLength(0)
  })

  test('unverified row dispatches verify-template OTP', async () => {
    seedRow({ id: 'email-1', verifiedAt: null })
    const result = await resendOwnedEmailOtp({ identityUserId: 'user-1', emailId: 'email-1', requestIp: '1.2.3.4' })
    expect(result.outcome).toBe('sent')
    expect(requestOtpCalls).toHaveLength(1)
    expect(requestOtpCalls[0].template).toBe('verify_personal_email')
  })
})
