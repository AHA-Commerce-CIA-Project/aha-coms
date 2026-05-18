import { describe, expect, mock, test, beforeEach } from 'bun:test'
import { fullDrizzleOrmMock, fullSchemaBarrelMock } from '~/test-helpers/schema-barrel-mock'

// ---------------------------------------------------------------------------
// Mock drizzle-orm — uses the full surface so asc/desc/etc. are all present
// ---------------------------------------------------------------------------

mock.module('drizzle-orm', () => fullDrizzleOrmMock())

// ---------------------------------------------------------------------------
// Mock schema
// ---------------------------------------------------------------------------

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

mock.module('~/db/schema', () => ({ ...fullSchemaBarrelMock(), identityUserEmails }))
mock.module('~/db/schema/identity-user-emails', () => ({ identityUserEmails }))

// ---------------------------------------------------------------------------
// Mock DB — chainable
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>

let _selectRows: Row[] = []

function makeSelectChain(rows: Row[]) {
  const chain: Record<string, unknown> = {}
  chain.from = () => chain
  chain.where = () => chain
  chain.orderBy = () => Promise.resolve(rows)
  chain.groupBy = () => Promise.resolve(rows)
  chain.limit = (_n: number) => Promise.resolve(rows.slice(0, _n as number))
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(onFulfilled, onRejected)
  return chain
}

const mockDb = {
  select: () => makeSelectChain(_selectRows),
}

mock.module('~/db', () => ({ db: mockDb }))

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

const { getDisplayEmailsForUsers } = await import('../email-resolution')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reset() {
  _selectRows = []
}

type EmailRow = {
  identityUserId: string
  email: string
  kind: 'workspace' | 'personal' | string
  isPrimary: boolean
  createdAt: Date
}

function row(overrides: { identityUserId: string; email: string } & Partial<EmailRow>): EmailRow {
  return {
    kind: 'personal',
    isPrimary: false,
    createdAt: new Date('2024-01-01'),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// getDisplayEmailsForUsers
// ---------------------------------------------------------------------------

describe('getDisplayEmailsForUsers', () => {
  beforeEach(reset)

  test('empty input array → returns empty map without querying DB', async () => {
    const result = await getDisplayEmailsForUsers([])
    expect(result.size).toBe(0)
  })

  test('single user with no email rows → maps to null', async () => {
    _selectRows = []
    const result = await getDisplayEmailsForUsers(['u1'])
    expect(result.get('u1')).toBeNull()
  })

  test('single user, workspace only → returns workspace email', async () => {
    _selectRows = [row({ identityUserId: 'u1', email: 'a@work', kind: 'workspace', isPrimary: false })]
    const result = await getDisplayEmailsForUsers(['u1'])
    expect(result.get('u1')).toBe('a@work')
  })

  test('workspace wins over personal+primary (Q8a invariant)', async () => {
    _selectRows = [
      row({ identityUserId: 'u1', email: 'a@work', kind: 'workspace', isPrimary: false, createdAt: new Date('2024-01-01') }),
      row({ identityUserId: 'u1', email: 'a@personal', kind: 'personal', isPrimary: true, createdAt: new Date('2024-01-02') }),
    ]
    const result = await getDisplayEmailsForUsers(['u1'])
    expect(result.get('u1')).toBe('a@work')
  })

  test('no workspace — primary personal wins over non-primary personal', async () => {
    _selectRows = [
      row({ identityUserId: 'u1', email: 'a@primary', kind: 'personal', isPrimary: true, createdAt: new Date('2024-01-01') }),
      row({ identityUserId: 'u1', email: 'a@other', kind: 'personal', isPrimary: false, createdAt: new Date('2024-01-02') }),
    ]
    const result = await getDisplayEmailsForUsers(['u1'])
    expect(result.get('u1')).toBe('a@primary')
  })

  test('no workspace, no primary — oldest personal email selected (createdAt ASC order)', async () => {
    // Query is ORDER BY createdAt ASC, so rows arrive oldest-first; .find() picks first
    _selectRows = [
      row({ identityUserId: 'u1', email: 'oldest@example.com', kind: 'personal', isPrimary: false, createdAt: new Date('2024-01-01') }),
      row({ identityUserId: 'u1', email: 'newer@example.com', kind: 'personal', isPrimary: false, createdAt: new Date('2024-06-01') }),
    ]
    const result = await getDisplayEmailsForUsers(['u1'])
    expect(result.get('u1')).toBe('oldest@example.com')
  })

  test('multiple users in one call — each resolves independently, absent user → null', async () => {
    _selectRows = [
      row({ identityUserId: 'u1', email: 'u1@work', kind: 'workspace', isPrimary: false }),
      row({ identityUserId: 'u2', email: 'u2@primary', kind: 'personal', isPrimary: true }),
      // u3 has no rows
    ]
    const result = await getDisplayEmailsForUsers(['u1', 'u2', 'u3'])
    expect(result.get('u1')).toBe('u1@work')
    expect(result.get('u2')).toBe('u2@primary')
    expect(result.get('u3')).toBeNull()
  })

  test('unknown email kind — no precedence rule matches → null', async () => {
    _selectRows = [
      row({ identityUserId: 'u1', email: 'u1@archive', kind: 'archive' as never, isPrimary: false }),
    ]
    const result = await getDisplayEmailsForUsers(['u1'])
    expect(result.get('u1')).toBeNull()
  })
})
