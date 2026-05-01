/**
 * Tests for the admin sign-out-everywhere endpoint — Spec 06 PR E §9.
 *
 * Strategy: inline handler logic rather than mounting the full Elysia route, mirroring
 * auth-otp-routes.test.ts.  No module mocking required.
 *
 * Route under test: POST /v1/employees/:id/sign-out-all
 *  - Admin or super_admin only.
 *  - Calls revokeAllSessionsForUser({reason:'admin_revoke'}); the service handles both
 *    per-row UPDATE on auth_sessions AND the session_revocations cutoff insert.
 *  - Writes one access_audit_log row with action='admin_sign_out_all'.
 *  - Returns 200 { revoked: <count> } on success, 404 if target user not found.
 */
import { beforeEach, describe, expect, test } from 'bun:test'

type UserRow = { id: string; status: 'active' | 'inactive' }
type AuditRow = {
  actorId: string
  action: string
  targetType: string
  targetId: string
  details?: Record<string, unknown>
}

let userStore: UserRow[] = []
let auditStore: AuditRow[] = []
let revokeAllCalls: Array<{ userId: string; reason: string; exceptSessionId?: string }> = []
let countActiveSessions: (userId: string) => number = () => 0

beforeEach(() => {
  userStore = [
    { id: 'target-1', status: 'active' },
    { id: 'inactive-1', status: 'inactive' },
  ]
  auditStore = []
  revokeAllCalls = []
  countActiveSessions = () => 0
})

type Outcome =
  | { status: 200; body: { revoked: number } }
  | { status: 404; body: { error: 'TARGET_NOT_FOUND'; message: string } }

async function signOutAllHandler(args: {
  targetUserId: string
  actor: { id: string }
  requestId?: string
  actorIp?: string
}): Promise<Outcome> {
  const target = userStore.find((u) => u.id === args.targetUserId)
  if (!target) {
    return { status: 404, body: { error: 'TARGET_NOT_FOUND', message: 'User not found' } }
  }

  const before = countActiveSessions(args.targetUserId)
  revokeAllCalls.push({ userId: args.targetUserId, reason: 'admin_revoke' })

  auditStore.push({
    actorId: args.actor.id,
    action: 'admin_sign_out_all',
    targetType: 'user',
    targetId: args.targetUserId,
    details: { revoked: before },
  })

  return { status: 200, body: { revoked: before } }
}

describe('POST /v1/employees/:id/sign-out-all (admin)', () => {
  test('happy path: revokes all active sessions, writes audit, returns count', async () => {
    countActiveSessions = (uid) => (uid === 'target-1' ? 3 : 0)

    const res = await signOutAllHandler({
      targetUserId: 'target-1',
      actor: { id: 'admin-1' },
      requestId: 'req-abc',
      actorIp: '203.0.113.1',
    })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ revoked: 3 })
    expect(revokeAllCalls).toEqual([{ userId: 'target-1', reason: 'admin_revoke' }])
    expect(auditStore).toHaveLength(1)
    expect(auditStore[0]).toMatchObject({
      actorId: 'admin-1',
      action: 'admin_sign_out_all',
      targetType: 'user',
      targetId: 'target-1',
    })
  })

  test('inactive target user: still revokes (admin can clean up after deactivation)', async () => {
    countActiveSessions = () => 1
    const res = await signOutAllHandler({
      targetUserId: 'inactive-1',
      actor: { id: 'admin-1' },
    })
    expect(res.status).toBe(200)
    expect(revokeAllCalls).toEqual([{ userId: 'inactive-1', reason: 'admin_revoke' }])
  })

  test('unknown user: 404 TARGET_NOT_FOUND, no revoke call, no audit', async () => {
    const res = await signOutAllHandler({
      targetUserId: 'ghost',
      actor: { id: 'admin-1' },
    })
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'TARGET_NOT_FOUND', message: 'User not found' })
    expect(revokeAllCalls).toEqual([])
    expect(auditStore).toEqual([])
  })

  test('zero active sessions still returns 200 with revoked=0', async () => {
    countActiveSessions = () => 0
    const res = await signOutAllHandler({
      targetUserId: 'target-1',
      actor: { id: 'admin-1' },
    })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ revoked: 0 })
    expect(revokeAllCalls).toHaveLength(1)
    expect(auditStore).toHaveLength(1)
    expect(auditStore[0].details).toEqual({ revoked: 0 })
  })

  test('audit row mirrors the shape used by other admin actions in employees.ts', async () => {
    countActiveSessions = () => 2
    await signOutAllHandler({
      targetUserId: 'target-1',
      actor: { id: 'admin-7' },
      requestId: 'req-99',
      actorIp: '198.51.100.5',
    })
    const row = auditStore[0]
    expect(row.action).toBe('admin_sign_out_all')
    expect(row.targetType).toBe('user')
    expect(typeof row.targetId).toBe('string')
    // details carries the revoked count for forensic correlation with auth_sessions rows
    expect(row.details).toEqual({ revoked: 2 })
  })
})
