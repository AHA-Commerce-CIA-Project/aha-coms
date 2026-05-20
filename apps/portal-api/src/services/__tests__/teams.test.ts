import { describe, expect, mock, test, beforeEach } from 'bun:test'
import { fullDrizzleOrmMock, fullSchemaBarrelMock } from '~/test-helpers/schema-barrel-mock'

// ---------------------------------------------------------------------------
// Mock drizzle-orm
// ---------------------------------------------------------------------------

mock.module('drizzle-orm', () => fullDrizzleOrmMock())

// ---------------------------------------------------------------------------
// Mock schema
// ---------------------------------------------------------------------------

const teamMembers = {
  id: 'teamMembers.id',
  teamId: 'teamMembers.teamId',
  userId: 'teamMembers.userId',
  roleInTeam: 'teamMembers.roleInTeam',
  createdAt: 'teamMembers.createdAt',
}

const teamAppAccess = {
  id: 'teamAppAccess.id',
  teamId: 'teamAppAccess.teamId',
  appId: 'teamAppAccess.appId',
}

const memberAppRole = {
  id: 'memberAppRole.id',
  userId: 'memberAppRole.userId',
  appId: 'memberAppRole.appId',
  appRole: 'memberAppRole.appRole',
}

const teams = {
  id: 'teams.id',
  name: 'teams.name',
}

mock.module('~/db/schema', () => ({
  ...fullSchemaBarrelMock(),
  teamMembers,
  teamAppAccess,
  memberAppRole,
  teams,
}))

// ---------------------------------------------------------------------------
// Mock provisioning-events
// ---------------------------------------------------------------------------

mock.module('../provisioning-events', () => ({
  emitUserUpdated: mock(async () => {}),
}))

// ---------------------------------------------------------------------------
// DB mock — tracks insert call counts and captured execute SQL
// ---------------------------------------------------------------------------

let insertCallCount = 0
let insertedValuesBatch: unknown[] = []
let executeCallCount = 0
let executedSqlStrings: string[] = []
let selectRows: unknown[] = []

type SelectChain = Record<string, unknown>

function makeSelectChain(rows: unknown[]): SelectChain {
  const chain: SelectChain = {}
  chain.from = () => chain
  chain.where = () => chain
  chain.innerJoin = () => chain
  chain.orderBy = () => Promise.resolve(rows)
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(onFulfilled, onRejected)
  return chain
}

const mockDb = {
  select: () => makeSelectChain(selectRows),

  insert: (_table: unknown) => ({
    values: (rows: unknown) => {
      insertCallCount++
      insertedValuesBatch = Array.isArray(rows) ? rows : [rows]
      return {
        onConflictDoNothing: () => Promise.resolve(),
      }
    },
  }),

  delete: (_table: unknown) => ({
    where: () => Promise.resolve(),
  }),

  update: (_table: unknown) => ({
    set: () => ({
      where: () => Promise.resolve(),
    }),
  }),

  execute: (sqlExpr: unknown) => {
    executeCallCount++
    // Capture the raw SQL string for inspection
    const sqlStr = typeof sqlExpr === 'object' && sqlExpr !== null
      ? JSON.stringify(sqlExpr)
      : String(sqlExpr)
    executedSqlStrings.push(sqlStr)
    return Promise.resolve()
  },

  transaction: async (fn: (tx: unknown) => Promise<void>) => {
    await fn(mockDb)
  },
}

mock.module('~/db', () => ({ db: mockDb }))

// ---------------------------------------------------------------------------
// Mock logger
// ---------------------------------------------------------------------------

mock.module('~/logger', () => ({
  logger: { error: () => {} },
}))

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

const { addTeamMembersBatch, removeTeamMember } = await import('../teams')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reset() {
  insertCallCount = 0
  insertedValuesBatch = []
  executeCallCount = 0
  executedSqlStrings = []
  selectRows = []
}

// ---------------------------------------------------------------------------
// T1.4 — addTeamMembersBatch: single batched INSERT
// ---------------------------------------------------------------------------

describe('addTeamMembersBatch', () => {
  beforeEach(reset)

  test('empty members → no DB call', async () => {
    await addTeamMembersBatch('team-1', [])
    expect(insertCallCount).toBe(0)
  })

  test('single member → exactly one INSERT call (not one per member)', async () => {
    await addTeamMembersBatch('team-1', [{ userId: 'user-a' }])
    expect(insertCallCount).toBe(1)
    expect(insertedValuesBatch).toHaveLength(1)
  })

  test('three members → exactly one INSERT call (T1.4: no loop, one round-trip)', async () => {
    await addTeamMembersBatch('team-1', [
      { userId: 'user-a' },
      { userId: 'user-b', roleInTeam: 'lead' },
      { userId: 'user-c' },
    ])
    expect(insertCallCount).toBe(1)
    // All three rows land in a single .values([...]) call
    expect(insertedValuesBatch).toHaveLength(3)
  })

  test('values array carries teamId and userId for each member', async () => {
    await addTeamMembersBatch('team-42', [
      { userId: 'user-x' },
      { userId: 'user-y', roleInTeam: 'admin' },
    ])
    const rows = insertedValuesBatch as Array<Record<string, unknown>>
    expect(rows[0].teamId).toBe('team-42')
    expect(rows[0].userId).toBe('user-x')
    expect(rows[1].teamId).toBe('team-42')
    expect(rows[1].userId).toBe('user-y')
    expect(rows[1].roleInTeam).toBe('admin')
  })
})

// ---------------------------------------------------------------------------
// T1.3 — removeTeamMember: single batched DELETE NOT EXISTS
// ---------------------------------------------------------------------------

describe('removeTeamMember', () => {
  beforeEach(reset)

  test('no team apps → no execute() call (nothing to clean up)', async () => {
    selectRows = [] // no apps for this team
    await removeTeamMember('team-1', 'user-a')
    expect(executeCallCount).toBe(0)
  })

  test('one team app → exactly one execute() DELETE (T1.3: single statement, not per-app loop)', async () => {
    selectRows = [{ appId: 'app-1' }]
    await removeTeamMember('team-1', 'user-a')
    expect(executeCallCount).toBe(1)
  })

  test('three team apps → still exactly one execute() DELETE (not three)', async () => {
    selectRows = [
      { appId: 'app-1' },
      { appId: 'app-2' },
      { appId: 'app-3' },
    ]
    await removeTeamMember('team-1', 'user-a')
    expect(executeCallCount).toBe(1)
  })
})
