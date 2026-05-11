import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { fullDrizzleOrmMock, fullSchemaBarrelMock } from '~/test-helpers/schema-barrel-mock'

const insertedRows: Array<Record<string, unknown>> = []

const db = {
  insert: (_table: unknown) => ({
    values(value: Record<string, unknown>) {
      insertedRows.push(value)
      return Promise.resolve()
    },
  }),
}

mock.module('~/db', () => ({ db }))
mock.module('~/db/schema', () => fullSchemaBarrelMock())
mock.module('drizzle-orm', () => fullDrizzleOrmMock())

const { logAudit } = await import('../audit')

describe('logAudit', () => {
  beforeEach(() => {
    insertedRows.length = 0
  })

  test('inserts a row with required fields', async () => {
    await logAudit({
      actorId: 'actor-uuid',
      action: 'create_employee',
      targetType: 'user',
      targetId: 'target-uuid',
    })

    expect(insertedRows).toHaveLength(1)
    expect(insertedRows[0]).toMatchObject({
      actorId: 'actor-uuid',
      action: 'create_employee',
      targetType: 'user',
      targetId: 'target-uuid',
    })
  })

  test('inserts requestId, actorIp, actorAppId, targetAppId when provided', async () => {
    await logAudit({
      actorId: 'actor-uuid',
      action: 'register_app',
      targetType: 'app',
      targetId: 'app-uuid',
      requestId: 'req-uuid-1234',
      actorIp: '203.0.113.5',
      actorAppId: 'actor-app-uuid',
      targetAppId: 'target-app-uuid',
    })

    expect(insertedRows).toHaveLength(1)
    const row = insertedRows[0]
    expect(row!.requestId).toBe('req-uuid-1234')
    expect(row!.actorIp).toBe('203.0.113.5')
    expect(row!.actorAppId).toBe('actor-app-uuid')
    expect(row!.targetAppId).toBe('target-app-uuid')
  })

  test('stores null for new fields when omitted', async () => {
    await logAudit({
      actorId: 'actor-uuid',
      action: 'create_team',
      targetType: 'team',
      targetId: 'team-uuid',
    })

    expect(insertedRows).toHaveLength(1)
    const row = insertedRows[0]
    expect(row!.requestId).toBeNull()
    expect(row!.actorIp).toBeNull()
    expect(row!.actorAppId).toBeNull()
    expect(row!.targetAppId).toBeNull()
  })

  test('stores details when provided', async () => {
    await logAudit({
      actorId: 'actor-uuid',
      action: 'update_employee',
      targetType: 'user',
      targetId: 'user-uuid',
      details: { portalRole: 'admin' },
    })

    expect(insertedRows[0]!.details).toEqual({ portalRole: 'admin' })
  })
})
