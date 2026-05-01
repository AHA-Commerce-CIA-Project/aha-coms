/**
 * Unit tests for services/otp.ts (PR B1, Spec 06 — OTP infrastructure).
 *
 * Uses the in-memory DB mock pattern established in sessions.test.ts.
 * Mail transport is memory (set BEFORE any imports).
 *
 * Covers all 15 cases specified in the mission brief.
 */

// IMPORTANT: set MAIL_TRANSPORT BEFORE any module import — transport is captured at load time.
process.env.MAIL_TRANSPORT = 'memory'
delete process.env.NODE_ENV // ensure not 'production'

import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { fullDrizzleOrmMock, fullSchemaBarrelMock } from '~/test-helpers/schema-barrel-mock'

// ---------------------------------------------------------------------------
// Sentinel table objects — must be reference-identical to what the production
// code imports from ~/db/schema (and ~/db/schema/otp-codes etc.)
// ---------------------------------------------------------------------------

const otpCodes = {
  id: 'otpCodes.id',
  emailNormalized: 'otpCodes.emailNormalized',
  codeHash: 'otpCodes.codeHash',
  attemptsRemaining: 'otpCodes.attemptsRemaining',
  expiresAt: 'otpCodes.expiresAt',
  consumedAt: 'otpCodes.consumedAt',
  invalidatedAt: 'otpCodes.invalidatedAt',
  requestIp: 'otpCodes.requestIp',
  createdAt: 'otpCodes.createdAt',
}

const otpRequestLog = {
  id: 'otpRequestLog.id',
  emailNormalized: 'otpRequestLog.emailNormalized',
  requestIp: 'otpRequestLog.requestIp',
  requestedAt: 'otpRequestLog.requestedAt',
  outcome: 'otpRequestLog.outcome',
}

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
  gipUid: 'identityUsers.gipUid',
  name: 'identityUsers.name',
  portalRole: 'identityUsers.portalRole',
  status: 'identityUsers.status',
  portalSub: 'identityUsers.portalSub',
  provisioningStatus: 'identityUsers.provisioningStatus',
  provisioningError: 'identityUsers.provisioningError',
  createdAt: 'identityUsers.createdAt',
  updatedAt: 'identityUsers.updatedAt',
}

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

type OtpCodeRow = {
  id: string
  emailNormalized: string
  codeHash: string
  attemptsRemaining: number
  expiresAt: Date
  consumedAt: Date | null
  invalidatedAt: Date | null
  requestIp: string | null
  createdAt: Date
}

type OtpLogRow = {
  id: string
  emailNormalized: string | null
  requestIp: string
  requestedAt: Date
  outcome: string
}

type EmailRow = {
  id: string
  identityUserId: string
  email: string
  emailNormalized: string
  kind: string
  isPrimary: boolean
  verifiedAt: Date | null
  addedBy: string
  createdAt: Date
  updatedAt: Date
}

type UserRow = {
  id: string
  gipUid: string | null
  name: string
  portalRole: string
  status: string
}

let otpCodeStore: OtpCodeRow[] = []
let otpLogStore: OtpLogRow[] = []
let emailStore: EmailRow[] = []
let userStore: UserRow[] = []

// ---------------------------------------------------------------------------
// DB mock — mirrors the select/insert/update chains used by otp.ts
// ---------------------------------------------------------------------------

/**
 * Track update calls so we can assert on them in tests.
 * Each entry: { table, setValues, condition }
 */
const updateLog: Array<{ table: unknown; setValues: Record<string, unknown> }> = []

function makeDb() {
  return {
    insert: (table: unknown) => ({
      values: (value: Record<string, unknown>) => {
        if (table === otpCodes) {
          otpCodeStore.push({
            id: (value.id as string) ?? `otp-${otpCodeStore.length + 1}`,
            emailNormalized: value.emailNormalized as string,
            codeHash: value.codeHash as string,
            attemptsRemaining: (value.attemptsRemaining as number) ?? 5,
            expiresAt: value.expiresAt as Date,
            consumedAt: (value.consumedAt as Date | null) ?? null,
            invalidatedAt: (value.invalidatedAt as Date | null) ?? null,
            requestIp: (value.requestIp as string | null) ?? null,
            createdAt: new Date(),
          })
        } else if (table === otpRequestLog) {
          otpLogStore.push({
            id: `log-${otpLogStore.length + 1}`,
            emailNormalized: (value.emailNormalized as string | null) ?? null,
            requestIp: value.requestIp as string,
            requestedAt: new Date(),
            outcome: value.outcome as string,
          })
        }
        return Promise.resolve()
      },
    }),

    select: (_fields: unknown) => ({
      from: (table: unknown) => ({
        where: (_cond: unknown) => ({
          limit: (_n: number) => {
            // Email lookup
            if (table === identityUserEmails) {
              // Return first email row (tests set up emailStore appropriately)
              return Promise.resolve(emailStore.length > 0 ? [emailStore[0]] : [])
            }
            // Identity user lookup (for verifyOtp status check)
            if (table === identityUsers) {
              const user = userStore[0]
              return Promise.resolve(user ? [user] : [])
            }
            // otp_codes lookup (for verifyOtp)
            if (table === otpCodes) {
              const now = new Date()
              const live = otpCodeStore.filter(
                (r) =>
                  r.consumedAt === null &&
                  r.invalidatedAt === null &&
                  r.expiresAt > now,
              )
              // ORDER BY createdAt DESC LIMIT 1
              const sorted = live.sort(
                (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
              )
              return Promise.resolve(sorted.length > 0 ? [sorted[0]] : [])
            }
            return Promise.resolve([])
          },
          orderBy: (_ord: unknown) => ({
            limit: (_n: number) => {
              if (table === otpCodes) {
                const now = new Date()
                const live = otpCodeStore.filter(
                  (r) =>
                    r.consumedAt === null &&
                    r.invalidatedAt === null &&
                    r.expiresAt > now,
                )
                const sorted = live.sort(
                  (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
                )
                return Promise.resolve(sorted.length > 0 ? [sorted[0]] : [])
              }
              return Promise.resolve([])
            },
          }),
        }),
        innerJoin: (_joinTable: unknown, _on: unknown) => ({
          where: (_cond: unknown) => ({
            limit: (_n: number) => {
              // verifyOtp: join identity_user_emails + identity_users
              if (table === identityUserEmails) {
                const emailRow = emailStore[0]
                if (!emailRow) return Promise.resolve([])
                const user = userStore.find((u) => u.id === emailRow.identityUserId)
                if (!user) return Promise.resolve([])
                return Promise.resolve([{ ...emailRow, ...user, emailRowId: emailRow.id }])
              }
              return Promise.resolve([])
            },
          }),
        }),
      }),
    }),

    // count queries: used for rate limiting checks
    // The mock handles these via a special pattern
    execute: () => Promise.resolve([{ count: 0 }]),

    update: (table: unknown) => ({
      set: (setValues: Record<string, unknown>) => ({
        where: (_cond: unknown) => {
          updateLog.push({ table, setValues })
          if (table === otpCodes) {
            // Apply the update to matching rows
            for (const row of otpCodeStore) {
              if (setValues.invalidatedAt !== undefined) {
                // Invalidate live rows for the email
                if (row.consumedAt === null && row.invalidatedAt === null) {
                  row.invalidatedAt = setValues.invalidatedAt as Date
                }
              }
              if (setValues.consumedAt !== undefined) {
                row.consumedAt = setValues.consumedAt as Date
              }
              if (setValues.attemptsRemaining !== undefined) {
                row.attemptsRemaining = setValues.attemptsRemaining as number
              }
            }
          }
          if (table === identityUserEmails) {
            if (setValues.verifiedAt !== undefined) {
              for (const row of emailStore) {
                row.verifiedAt = setValues.verifiedAt as Date
              }
            }
          }
          return Promise.resolve()
        },
      }),
    }),
  }
}

// ---------------------------------------------------------------------------
// Mock wiring — BEFORE importing production code
// ---------------------------------------------------------------------------

// The rate-limit count queries are special: otp.ts uses SELECT count(*) on
// otp_request_log twice (once for email cooldown, once for IP cap).
// We expose mutable counters so individual tests can control each check.
// The mock returns emailRateLimitCount for the FIRST count call on
// otpRequestLog, and ipRateLimitCount for the SECOND.
let emailRateLimitCount = 0
let ipRateLimitCount = 0

function makeDbWithRateLimits() {
  const base = makeDb()
  let rateLimitCallIndex = 0

  return {
    ...base,
    // Override select to intercept count queries on otpRequestLog
    select: (fields: unknown) => {
      return {
        from: (table: unknown) => {
          if (table === otpRequestLog) {
            return {
              where: (_cond: unknown) => {
                // First call = email cooldown, second call = IP cap
                const count = rateLimitCallIndex === 0
                  ? emailRateLimitCount
                  : ipRateLimitCount
                rateLimitCallIndex++
                return Promise.resolve([{ count }])
              },
            }
          }
          // Delegate everything else to base mock
          return base.select(fields).from(table)
        },
      }
    },
    // Reset the call index on each use (tests that call requestOtp multiple
    // times within one test need fresh counts each time).
    _resetRateLimitIndex: () => { rateLimitCallIndex = 0 },
  }
}

let db = makeDbWithRateLimits()

mock.module('~/db', () => ({ db }))

mock.module('~/db/schema', () => ({
  ...fullSchemaBarrelMock(),
  otpCodes,
  otpRequestLog,
  identityUserEmails,
  identityUsers,
}))

mock.module('~/db/schema/otp-codes', () => ({
  otpCodes,
}))

mock.module('~/db/schema/otp-request-log', () => ({
  otpRequestLog,
  OTP_REQUEST_OUTCOMES: [
    'sent',
    'rate_limited_email',
    'rate_limited_ip',
    'unknown_email',
    'wrong_login_path',
  ],
}))

mock.module('~/db/schema/identity-user-emails', () => ({
  identityUserEmails,
}))

mock.module('~/db/schema/identity-users', () => ({
  identityUsers,
}))

mock.module('drizzle-orm', () => fullDrizzleOrmMock())

mock.module('~/logger', () => ({
  logger: { info: () => {}, error: () => {}, warn: () => {} },
}))

// Import mail AFTER setting MAIL_TRANSPORT env
const { __memoryInbox, __clearMemoryInbox } = await import('~/services/mail')

// Import production code AFTER all mocks
const { requestOtp, verifyOtp } = await import('../otp')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function makeEmailRow(overrides: Partial<EmailRow> = {}): EmailRow {
  return {
    id: 'email-row-1',
    identityUserId: 'user-1',
    email: 'alice@example.com',
    emailNormalized: 'alice@example.com',
    kind: 'personal',
    isPrimary: true,
    verifiedAt: new Date('2026-01-01T00:00:00Z'),
    addedBy: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeUserRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'user-1',
    gipUid: null,
    name: 'Alice',
    portalRole: 'employee',
    status: 'active',
    ...overrides,
  }
}

function seedLiveOtpCode(overrides: Partial<OtpCodeRow> = {}): OtpCodeRow {
  const row: OtpCodeRow = {
    id: `otp-seed-${otpCodeStore.length + 1}`,
    emailNormalized: 'alice@example.com',
    codeHash: sha256hex('123456'),
    attemptsRemaining: 5,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // +10 min
    consumedAt: null,
    invalidatedAt: null,
    requestIp: '1.2.3.4',
    createdAt: new Date(Date.now() - 1000), // 1s ago
    ...overrides,
  }
  otpCodeStore.push(row)
  return row
}

beforeEach(() => {
  otpCodeStore = []
  otpLogStore = []
  emailStore = []
  userStore = []
  updateLog.length = 0
  emailRateLimitCount = 0
  ipRateLimitCount = 0
  __clearMemoryInbox()
  db = makeDbWithRateLimits()
  mock.module('~/db', () => ({ db }))
})

// ---------------------------------------------------------------------------
// requestOtp tests
// ---------------------------------------------------------------------------

describe('requestOtp — case 1: personal email → sent', () => {
  test('inserts otp_codes row with correct shape, sends email, logs sent', async () => {
    emailStore.push(makeEmailRow({ kind: 'personal' }))
    userStore.push(makeUserRow())

    const result = await requestOtp({
      email: 'alice@example.com',
      requestIp: '1.2.3.4',
    })

    expect(result.outcome).toBe('sent')

    // otp_codes row inserted
    expect(otpCodeStore).toHaveLength(1)
    const codeRow = otpCodeStore[0]
    expect(codeRow.codeHash).toMatch(/^[0-9a-f]{64}$/) // 64-char hex (SHA-256)
    expect(codeRow.attemptsRemaining).toBe(5)
    // expiresAt within ~2s of now + 10min
    const tenMin = 10 * 60 * 1000
    const delta = codeRow.expiresAt.getTime() - Date.now()
    expect(delta).toBeGreaterThan(tenMin - 2000)
    expect(delta).toBeLessThan(tenMin + 2000)
    expect(codeRow.emailNormalized).toBe('alice@example.com')

    // email sent
    expect(__memoryInbox).toHaveLength(1)
    expect(__memoryInbox[0].to).toBe('alice@example.com')
    expect(__memoryInbox[0].subject).toBe('Your COMS portal sign-in code')
    // textContent should contain the 6-digit code
    // We can verify by finding a 6-digit sequence
    expect(__memoryInbox[0].textContent).toMatch(/\d{6}/)

    // log row
    expect(otpLogStore).toHaveLength(1)
    expect(otpLogStore[0].outcome).toBe('sent')
  })
})

describe('requestOtp — case 1b: verify_personal_email template (PR D binding flow)', () => {
  test('template=verify_personal_email sends verify subject, otherwise identical to login', async () => {
    emailStore.push(makeEmailRow({ kind: 'personal' }))
    userStore.push(makeUserRow())

    const result = await requestOtp({
      email: 'alice@example.com',
      requestIp: '1.2.3.4',
      template: 'verify_personal_email',
    })

    expect(result.outcome).toBe('sent')
    expect(otpCodeStore).toHaveLength(1)
    expect(__memoryInbox).toHaveLength(1)
    expect(__memoryInbox[0].subject).toBe('Verify your personal email for COMS portal')
    expect(__memoryInbox[0].textContent).toMatch(/\d{6}/)
  })
})

describe('requestOtp — case 2: workspace email → wrong_login_path', () => {
  test('returns wrong_login_path, no code, no email, logs outcome', async () => {
    emailStore.push(makeEmailRow({ kind: 'workspace' }))

    const result = await requestOtp({
      email: 'alice@example.com',
      requestIp: '1.2.3.4',
    })

    expect(result.outcome).toBe('wrong_login_path')
    expect(otpCodeStore).toHaveLength(0)
    expect(__memoryInbox).toHaveLength(0)
    expect(otpLogStore).toHaveLength(1)
    expect(otpLogStore[0].outcome).toBe('wrong_login_path')
  })
})

describe('requestOtp — case 3: unknown email → unknown_email', () => {
  test('returns unknown_email, no code, no email, logs outcome', async () => {
    // emailStore is empty — no match

    const result = await requestOtp({
      email: 'nobody@example.com',
      requestIp: '1.2.3.4',
    })

    expect(result.outcome).toBe('unknown_email')
    expect(otpCodeStore).toHaveLength(0)
    expect(__memoryInbox).toHaveLength(0)
    expect(otpLogStore).toHaveLength(1)
    expect(otpLogStore[0].outcome).toBe('unknown_email')
  })
})

describe('requestOtp — case 4: per-email cooldown', () => {
  test('1 prior sent row in last 60s → rate_limited_email', async () => {
    // Seed a prior log row for the same email within cooldown window
    otpLogStore.push({
      id: 'log-prior',
      emailNormalized: 'alice@example.com',
      requestIp: '9.9.9.9',
      requestedAt: new Date(Date.now() - 30 * 1000), // 30s ago — within 60s window
      outcome: 'sent',
    })
    emailRateLimitCount = 1 // mock will return this for email rate-limit query

    emailStore.push(makeEmailRow({ kind: 'personal' }))

    const result = await requestOtp({
      email: 'alice@example.com',
      requestIp: '1.2.3.4',
      now: () => new Date('2026-05-01T12:00:00Z'),
    })

    expect(result.outcome).toBe('rate_limited_email')
    expect(otpCodeStore).toHaveLength(0)
    expect(__memoryInbox).toHaveLength(0)
    expect(otpLogStore.filter((r) => r.outcome === 'rate_limited_email')).toHaveLength(1)
  })
})

describe('requestOtp — case 5: per-IP cap', () => {
  test('30 prior rows from same IP in last 60min → rate_limited_ip', async () => {
    emailRateLimitCount = 0    // email cooldown passes
    ipRateLimitCount = 30      // IP cap exceeded
    emailStore.push(makeEmailRow({ kind: 'personal' }))

    const result = await requestOtp({
      email: 'alice@example.com',
      requestIp: '1.2.3.4',
      now: () => new Date('2026-05-01T12:00:00Z'),
    })

    expect(result.outcome).toBe('rate_limited_ip')
    expect(otpCodeStore).toHaveLength(0)
    expect(__memoryInbox).toHaveLength(0)
    expect(otpLogStore.filter((r) => r.outcome === 'rate_limited_ip')).toHaveLength(1)
  })
})

describe('requestOtp — case 6: email normalization', () => {
  test('email is lowercased and trimmed before lookup and storage', async () => {
    emailStore.push(makeEmailRow({
      emailNormalized: 'alice@example.com',
      kind: 'personal',
    }))
    userStore.push(makeUserRow())

    const result = await requestOtp({
      email: '  ALICE@EXAMPLE.COM  ',
      requestIp: '1.2.3.4',
    })

    expect(result.outcome).toBe('sent')
    expect(otpCodeStore[0].emailNormalized).toBe('alice@example.com')
    expect(__memoryInbox[0].to).toBe('alice@example.com')
  })
})

describe('requestOtp — case 7: supersede prior live code', () => {
  test('prior live code gets invalidated_at set when new code is issued', async () => {
    emailStore.push(makeEmailRow({ kind: 'personal' }))
    userStore.push(makeUserRow())

    // Seed an existing live code
    seedLiveOtpCode({ emailNormalized: 'alice@example.com' })
    expect(otpCodeStore[0].invalidatedAt).toBeNull()

    await requestOtp({
      email: 'alice@example.com',
      requestIp: '1.2.3.4',
    })

    // The prior code should be invalidated
    expect(otpCodeStore[0].invalidatedAt).toBeInstanceOf(Date)
    // A new code was also inserted
    expect(otpCodeStore).toHaveLength(2)
    expect(otpCodeStore[1].invalidatedAt).toBeNull()
  })
})

describe('requestOtp — case 8: unverified personal email still sends OTP', () => {
  test('verifiedAt IS NULL on personal email → OTP still sent', async () => {
    emailStore.push(makeEmailRow({
      kind: 'personal',
      verifiedAt: null, // unverified
    }))
    userStore.push(makeUserRow())

    const result = await requestOtp({
      email: 'alice@example.com',
      requestIp: '1.2.3.4',
    })

    expect(result.outcome).toBe('sent')
    expect(__memoryInbox).toHaveLength(1)
    expect(otpCodeStore).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// verifyOtp tests
// ---------------------------------------------------------------------------

describe('verifyOtp — case 9: happy path', () => {
  test('matching code → verified, consumed_at set, returns identityUserId + emailRowId', async () => {
    const code = '654321'
    emailStore.push(makeEmailRow({
      kind: 'personal',
      verifiedAt: new Date(),
    }))
    userStore.push(makeUserRow({ status: 'active' }))
    seedLiveOtpCode({
      emailNormalized: 'alice@example.com',
      codeHash: sha256hex(code),
    })

    const result = await verifyOtp({
      email: 'alice@example.com',
      code,
    })

    expect(result.outcome).toBe('verified')
    if (result.outcome === 'verified') {
      expect(result.identityUserId).toBe('user-1')
      expect(result.emailRowId).toBe('email-row-1')
      expect(result.emailNormalized).toBe('alice@example.com')
    }
    // consumed_at should be set on the code row
    expect(otpCodeStore[0].consumedAt).toBeInstanceOf(Date)
  })

  test('if verifiedAt IS NULL, it gets set on successful verify', async () => {
    const code = '111222'
    emailStore.push(makeEmailRow({
      kind: 'personal',
      verifiedAt: null, // not yet verified
    }))
    userStore.push(makeUserRow({ status: 'active' }))
    seedLiveOtpCode({
      emailNormalized: 'alice@example.com',
      codeHash: sha256hex(code),
    })

    const result = await verifyOtp({ email: 'alice@example.com', code })

    expect(result.outcome).toBe('verified')
    // verifiedAt should now be set on the email row
    expect(emailStore[0].verifiedAt).toBeInstanceOf(Date)
  })
})

describe('verifyOtp — case 10: expired code', () => {
  test('code with expiresAt in the past → invalid_or_expired', async () => {
    const code = '999888'
    // Insert an expired code directly — bypasses the live-filter in our mock
    otpCodeStore.push({
      id: 'expired-otp',
      emailNormalized: 'alice@example.com',
      codeHash: sha256hex(code),
      attemptsRemaining: 5,
      expiresAt: new Date(Date.now() - 60 * 1000), // expired 60s ago
      consumedAt: null,
      invalidatedAt: null,
      requestIp: null,
      createdAt: new Date(Date.now() - 70 * 1000),
    })

    emailStore.push(makeEmailRow())
    userStore.push(makeUserRow())

    const result = await verifyOtp({ email: 'alice@example.com', code })

    expect(result.outcome).toBe('invalid_or_expired')
  })
})

describe('verifyOtp — case 11: wrong code decrements attempts', () => {
  test('wrong code decrements attemptsRemaining; at 0, invalidatedAt is set', async () => {
    const correctCode = '000001'
    const wrongCode = '999999'
    emailStore.push(makeEmailRow())
    userStore.push(makeUserRow())
    seedLiveOtpCode({
      emailNormalized: 'alice@example.com',
      codeHash: sha256hex(correctCode),
      attemptsRemaining: 2,
    })

    // First wrong attempt
    const r1 = await verifyOtp({ email: 'alice@example.com', code: wrongCode })
    expect(r1.outcome).toBe('invalid_or_expired')
    if (r1.outcome === 'invalid_or_expired') {
      expect(r1.attemptsRemaining).toBe(1)
    }
    expect(otpCodeStore[0].attemptsRemaining).toBe(1)
    expect(otpCodeStore[0].invalidatedAt).toBeNull()

    // Second wrong attempt — reaches 0, should invalidate
    const r2 = await verifyOtp({ email: 'alice@example.com', code: wrongCode })
    expect(r2.outcome).toBe('invalid_or_expired')
    if (r2.outcome === 'invalid_or_expired') {
      expect(r2.attemptsRemaining).toBe(0)
    }
    expect(otpCodeStore[0].invalidatedAt).toBeInstanceOf(Date)
  })
})

describe('verifyOtp — case 12: already consumed', () => {
  test('consumedAt already set → invalid_or_expired (single-use)', async () => {
    const code = '123456'
    otpCodeStore.push({
      id: 'consumed-otp',
      emailNormalized: 'alice@example.com',
      codeHash: sha256hex(code),
      attemptsRemaining: 5,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      consumedAt: new Date(), // already consumed
      invalidatedAt: null,
      requestIp: null,
      createdAt: new Date(),
    })

    emailStore.push(makeEmailRow())
    userStore.push(makeUserRow())

    const result = await verifyOtp({ email: 'alice@example.com', code })
    // The mock filters out consumed rows, so query returns empty → invalid_or_expired
    expect(result.outcome).toBe('invalid_or_expired')
  })
})

describe('verifyOtp — case 13: already invalidated', () => {
  test('invalidatedAt already set → invalid_or_expired', async () => {
    const code = '777666'
    otpCodeStore.push({
      id: 'invalidated-otp',
      emailNormalized: 'alice@example.com',
      codeHash: sha256hex(code),
      attemptsRemaining: 5,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      consumedAt: null,
      invalidatedAt: new Date(), // already invalidated
      requestIp: null,
      createdAt: new Date(),
    })

    emailStore.push(makeEmailRow())
    userStore.push(makeUserRow())

    const result = await verifyOtp({ email: 'alice@example.com', code })
    expect(result.outcome).toBe('invalid_or_expired')
  })
})

describe('verifyOtp — case 14: inactive user', () => {
  test('identity_users.status != active → inactive_user; code IS consumed', async () => {
    const code = '555444'
    emailStore.push(makeEmailRow({ kind: 'personal' }))
    userStore.push(makeUserRow({ status: 'inactive' }))
    seedLiveOtpCode({
      emailNormalized: 'alice@example.com',
      codeHash: sha256hex(code),
    })

    const result = await verifyOtp({ email: 'alice@example.com', code })

    expect(result.outcome).toBe('inactive_user')
    // Code should still be consumed (prevent retry)
    expect(otpCodeStore[0].consumedAt).toBeInstanceOf(Date)
  })
})

describe('verifyOtp — case 15: email normalization', () => {
  test('email is lowercased and trimmed before lookup', async () => {
    const code = '333222'
    emailStore.push(makeEmailRow({ emailNormalized: 'alice@example.com', kind: 'personal' }))
    userStore.push(makeUserRow({ status: 'active' }))
    seedLiveOtpCode({
      emailNormalized: 'alice@example.com',
      codeHash: sha256hex(code),
    })

    const result = await verifyOtp({
      email: '  ALICE@EXAMPLE.COM  ',
      code,
    })

    expect(result.outcome).toBe('verified')
    if (result.outcome === 'verified') {
      expect(result.emailNormalized).toBe('alice@example.com')
    }
  })
})
