/**
 * One-time login link — Spec 06 PR E §11.
 *
 * Inline-handler tests pinning the contract for the issue + consume flow.
 *
 * Coverage (per spec testing scope):
 *  - super_admin gate (other roles 403)
 *  - 5-min TTL
 *  - single-use (atomic — second consume rejects)
 *  - dual audit: one_time_link_issued + one_time_link_consumed
 *  - consumed_from_ip recorded
 *  - hash-not-plaintext storage (token never appears in DB rows)
 *  - 1-hour session TTL on consume (admin_bypass)
 */
import { beforeEach, describe, expect, test } from 'bun:test'
import { createHash, randomBytes, randomUUID } from 'crypto'

type LinkRow = {
  id: string
  targetIdentityUserId: string
  issuedBy: string
  tokenHash: string
  expiresAt: Date
  consumedAt: Date | null
  reason: string
  reasonText: string | null
  issuedFromIp: string | null
  consumedFromIp: string | null
  createdAt: Date
}

type SessionRow = {
  id: string
  identityUserId: string
  authMethod: 'workspace_oidc' | 'personal_otp' | 'admin_bypass'
  emailUsed: string | null
  expiresAt: Date
  createdAt: Date
  revokedAt: Date | null
}

type AuditRow = {
  actorId: string
  action: string
  targetType: string
  targetId: string
  details?: Record<string, unknown>
}

let linkStore: LinkRow[] = []
let sessionStore: SessionRow[] = []
let auditStore: AuditRow[] = []
let userStore: Array<{ id: string; status: 'active' | 'inactive' }> = []

beforeEach(() => {
  linkStore = []
  sessionStore = []
  auditStore = []
  userStore = [
    { id: 'target-1', status: 'active' },
    { id: 'inactive-1', status: 'inactive' },
  ]
})

const PORTAL_ORIGIN = 'https://coms.ahacommerce.net'
const SHA256_HEX_RE = /^[a-f0-9]{64}$/

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

// ---------------------------------------------------------------------------
// Service contract
// ---------------------------------------------------------------------------
async function issue(args: {
  targetIdentityUserId: string
  issuedBy: string
  reason: 'lost_email_access' | 'support_handoff' | 'identity_recovery' | 'other'
  reasonText: string | null
  requestIp: string | null
}): Promise<{ id: string; token: string; url: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = sha256Hex(token)
  const id = randomUUID()
  const expiresAt = new Date(Date.now() + 5 * 60_000)
  linkStore.push({
    id,
    targetIdentityUserId: args.targetIdentityUserId,
    issuedBy: args.issuedBy,
    tokenHash,
    expiresAt,
    consumedAt: null,
    reason: args.reason,
    reasonText: args.reasonText,
    issuedFromIp: args.requestIp,
    consumedFromIp: null,
    createdAt: new Date(),
  })
  return {
    id,
    token,
    url: `${PORTAL_ORIGIN}/auth/one-time?token=${encodeURIComponent(token)}`,
    expiresAt,
  }
}

async function consume(args: { token: string; requestIp: string | null }): Promise<
  | { outcome: 'consumed'; row: LinkRow }
  | { outcome: 'invalid' }
  | { outcome: 'expired' }
  | { outcome: 'already_used' }
> {
  const tokenHash = sha256Hex(args.token)
  const row = linkStore.find((r) => r.tokenHash === tokenHash)
  if (!row) return { outcome: 'invalid' }
  if (row.consumedAt !== null) return { outcome: 'already_used' }
  if (row.expiresAt < new Date()) return { outcome: 'expired' }
  // Atomic-ish: mark consumed in this branch.
  row.consumedAt = new Date()
  row.consumedFromIp = args.requestIp
  return { outcome: 'consumed', row }
}

// ---------------------------------------------------------------------------
// Issue route handler (super_admin only)
// ---------------------------------------------------------------------------
async function issueHandler(args: {
  targetUserId: string
  actor: { id: string; portalRole: 'employee' | 'admin' | 'super_admin' }
  body: { reason: 'lost_email_access' | 'support_handoff' | 'identity_recovery' | 'other'; reasonText?: string }
  requestIp: string | null
}): Promise<
  | { status: 200; body: { url: string; expiresAt: string; id: string } }
  | { status: 403; body: { error: 'INSUFFICIENT_ROLE' } }
  | { status: 404; body: { error: 'TARGET_NOT_FOUND' } }
> {
  if (args.actor.portalRole !== 'super_admin') {
    return { status: 403, body: { error: 'INSUFFICIENT_ROLE' } }
  }
  const target = userStore.find((u) => u.id === args.targetUserId)
  if (!target) {
    return { status: 404, body: { error: 'TARGET_NOT_FOUND' } }
  }
  const issued = await issue({
    targetIdentityUserId: args.targetUserId,
    issuedBy: args.actor.id,
    reason: args.body.reason,
    reasonText: args.body.reasonText ?? null,
    requestIp: args.requestIp,
  })
  auditStore.push({
    actorId: args.actor.id,
    action: 'one_time_link_issued',
    targetType: 'user',
    targetId: args.targetUserId,
    details: { reason: args.body.reason, reasonText: args.body.reasonText, linkId: issued.id },
  })
  return {
    status: 200,
    body: { url: issued.url, expiresAt: issued.expiresAt.toISOString(), id: issued.id },
  }
}

// ---------------------------------------------------------------------------
// Consume route handler (no auth — uses opaque token)
// ---------------------------------------------------------------------------
async function consumeHandler(args: { token: string; requestIp: string | null }): Promise<
  | { status: 303; redirectTo: string; sessionId: string }
  | { status: 403; body: { error: 'INVALID_OR_EXPIRED' } }
> {
  const result = await consume({ token: args.token, requestIp: args.requestIp })
  if (result.outcome !== 'consumed') {
    return { status: 403, body: { error: 'INVALID_OR_EXPIRED' } }
  }
  const sessionId = randomUUID()
  const oneHour = 60 * 60_000
  sessionStore.push({
    id: sessionId,
    identityUserId: result.row.targetIdentityUserId,
    authMethod: 'admin_bypass',
    emailUsed: null,
    expiresAt: new Date(Date.now() + oneHour),
    createdAt: new Date(),
    revokedAt: null,
  })
  auditStore.push({
    actorId: result.row.issuedBy,
    action: 'one_time_link_consumed',
    targetType: 'user',
    targetId: result.row.targetIdentityUserId,
    details: { linkId: result.row.id, consumedFromIp: args.requestIp },
  })
  return { status: 303, redirectTo: '/', sessionId }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /v1/employees/:id/login-link (issue)', () => {
  test('employee → 403 INSUFFICIENT_ROLE', async () => {
    const res = await issueHandler({
      targetUserId: 'target-1',
      actor: { id: 'employee-x', portalRole: 'employee' },
      body: { reason: 'lost_email_access', reasonText: 'forgot password' },
      requestIp: '203.0.113.5',
    })
    expect(res.status).toBe(403)
    expect(linkStore).toEqual([])
    expect(auditStore).toEqual([])
  })

  test('admin → 403 INSUFFICIENT_ROLE (gate is strict)', async () => {
    const res = await issueHandler({
      targetUserId: 'target-1',
      actor: { id: 'admin-x', portalRole: 'admin' },
      body: { reason: 'support_handoff' },
      requestIp: null,
    })
    expect(res.status).toBe(403)
    expect(linkStore).toEqual([])
  })

  test('super_admin → 200 with url and expiresAt', async () => {
    const res = await issueHandler({
      targetUserId: 'target-1',
      actor: { id: 'sa-1', portalRole: 'super_admin' },
      body: { reason: 'lost_email_access', reasonText: 'OTP inbox compromised' },
      requestIp: '203.0.113.10',
    })
    expect(res.status).toBe(200)
    if (res.status !== 200) throw new Error('unreachable')
    expect(res.body.url).toMatch(/\/auth\/one-time\?token=/)
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now())
    expect(linkStore).toHaveLength(1)
    expect(linkStore[0].issuedFromIp).toBe('203.0.113.10')
    expect(linkStore[0].issuedBy).toBe('sa-1')
    expect(linkStore[0].targetIdentityUserId).toBe('target-1')
  })

  test('audit row is one_time_link_issued with full reason payload', async () => {
    await issueHandler({
      targetUserId: 'target-1',
      actor: { id: 'sa-1', portalRole: 'super_admin' },
      body: { reason: 'identity_recovery', reasonText: 'lost phone, no recovery email' },
      requestIp: null,
    })
    expect(auditStore).toHaveLength(1)
    expect(auditStore[0]).toMatchObject({
      actorId: 'sa-1',
      action: 'one_time_link_issued',
      targetType: 'user',
      targetId: 'target-1',
    })
    expect(auditStore[0].details).toMatchObject({
      reason: 'identity_recovery',
      reasonText: 'lost phone, no recovery email',
    })
  })

  test('unknown user → 404 TARGET_NOT_FOUND', async () => {
    const res = await issueHandler({
      targetUserId: 'ghost',
      actor: { id: 'sa-1', portalRole: 'super_admin' },
      body: { reason: 'other' },
      requestIp: null,
    })
    expect(res.status).toBe(404)
    expect(linkStore).toEqual([])
    expect(auditStore).toEqual([])
  })

  test('token storage is hashed (SHA-256 hex), plaintext never in DB', async () => {
    const res = await issueHandler({
      targetUserId: 'target-1',
      actor: { id: 'sa-1', portalRole: 'super_admin' },
      body: { reason: 'support_handoff' },
      requestIp: null,
    })
    if (res.status !== 200) throw new Error('expected 200')
    const tokenInUrl = decodeURIComponent(res.body.url.split('token=')[1] ?? '')
    expect(tokenInUrl).not.toBe('')
    expect(linkStore[0].tokenHash).toMatch(SHA256_HEX_RE)
    // Plaintext token must not appear anywhere in stored row.
    const serialized = JSON.stringify(linkStore[0])
    expect(serialized).not.toContain(tokenInUrl)
    // The hash is the SHA-256 of the plaintext.
    expect(linkStore[0].tokenHash).toBe(sha256Hex(tokenInUrl))
  })
})

describe('GET /auth/one-time (consume)', () => {
  test('happy path: mints admin_bypass session with 1-hour TTL, audits consumed, records IP, redirects to /', async () => {
    const issued = await issueHandler({
      targetUserId: 'target-1',
      actor: { id: 'sa-1', portalRole: 'super_admin' },
      body: { reason: 'support_handoff' },
      requestIp: '203.0.113.10',
    })
    if (issued.status !== 200) throw new Error('expected 200')
    const tokenInUrl = decodeURIComponent(issued.body.url.split('token=')[1] ?? '')

    const res = await consumeHandler({ token: tokenInUrl, requestIp: '198.51.100.99' })
    expect(res.status).toBe(303)
    if (res.status !== 303) throw new Error('expected 303')
    expect(res.redirectTo).toBe('/')

    // Session was minted
    expect(sessionStore).toHaveLength(1)
    expect(sessionStore[0].authMethod).toBe('admin_bypass')
    expect(sessionStore[0].emailUsed).toBeNull()
    expect(sessionStore[0].identityUserId).toBe('target-1')
    // 1-hour TTL — generous tolerance
    const ttlMs = sessionStore[0].expiresAt.getTime() - sessionStore[0].createdAt.getTime()
    expect(ttlMs).toBeGreaterThanOrEqual(60 * 60_000 - 5_000)
    expect(ttlMs).toBeLessThanOrEqual(60 * 60_000 + 5_000)

    // consumed_from_ip recorded
    expect(linkStore[0].consumedFromIp).toBe('198.51.100.99')
    expect(linkStore[0].consumedAt).not.toBeNull()

    // Both audit rows present
    const actions = auditStore.map((r) => r.action)
    expect(actions).toEqual(['one_time_link_issued', 'one_time_link_consumed'])
    expect(auditStore[1].targetId).toBe('target-1')
    expect(auditStore[1].details).toMatchObject({
      consumedFromIp: '198.51.100.99',
    })
  })

  test('single-use: second consume of same token → 403 ALREADY_USED treated as INVALID_OR_EXPIRED', async () => {
    const issued = await issueHandler({
      targetUserId: 'target-1',
      actor: { id: 'sa-1', portalRole: 'super_admin' },
      body: { reason: 'support_handoff' },
      requestIp: null,
    })
    if (issued.status !== 200) throw new Error('expected 200')
    const tokenInUrl = decodeURIComponent(issued.body.url.split('token=')[1] ?? '')

    const first = await consumeHandler({ token: tokenInUrl, requestIp: '1.1.1.1' })
    expect(first.status).toBe(303)

    const second = await consumeHandler({ token: tokenInUrl, requestIp: '2.2.2.2' })
    expect(second.status).toBe(403)
    if (second.status !== 403) throw new Error('expected 403')
    expect(second.body.error).toBe('INVALID_OR_EXPIRED')
    // Only one session minted total
    expect(sessionStore).toHaveLength(1)
  })

  test('expired token → 403 INVALID_OR_EXPIRED, no session minted', async () => {
    // Manually backdate: insert expired row via service, then re-stamp expiresAt.
    const issued = await issueHandler({
      targetUserId: 'target-1',
      actor: { id: 'sa-1', portalRole: 'super_admin' },
      body: { reason: 'support_handoff' },
      requestIp: null,
    })
    if (issued.status !== 200) throw new Error('expected 200')
    const tokenInUrl = decodeURIComponent(issued.body.url.split('token=')[1] ?? '')

    // Force expiry
    linkStore[0].expiresAt = new Date(Date.now() - 1_000)

    const res = await consumeHandler({ token: tokenInUrl, requestIp: null })
    expect(res.status).toBe(403)
    expect(sessionStore).toHaveLength(0)
    // Only the issued audit; no consumed audit on rejection.
    expect(auditStore.map((r) => r.action)).toEqual(['one_time_link_issued'])
  })

  test('unknown token → 403, no session, no audit', async () => {
    const res = await consumeHandler({
      token: 'totally-not-a-real-token-just-bytes',
      requestIp: '203.0.113.99',
    })
    expect(res.status).toBe(403)
    expect(sessionStore).toEqual([])
    expect(auditStore).toEqual([])
  })

  test('5-min TTL is the issued expiresAt', async () => {
    const issued = await issueHandler({
      targetUserId: 'target-1',
      actor: { id: 'sa-1', portalRole: 'super_admin' },
      body: { reason: 'support_handoff' },
      requestIp: null,
    })
    if (issued.status !== 200) throw new Error('expected 200')
    const ttlMs = new Date(issued.body.expiresAt).getTime() - Date.now()
    expect(ttlMs).toBeGreaterThanOrEqual(5 * 60_000 - 1_000)
    expect(ttlMs).toBeLessThanOrEqual(5 * 60_000 + 1_000)
  })
})
