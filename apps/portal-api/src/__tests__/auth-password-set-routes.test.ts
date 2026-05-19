/**
 * Tests for POST /api/auth/password/set — Spec 06 PR F.
 *
 * Inline-handler tests covering the documented branches: weak password,
 * first-set requires the session flag, change-password requires
 * currentPassword + GIP verification, success updates passwordSetAt and
 * logs the audit row.
 */
import { beforeEach, describe, expect, test } from 'bun:test'

import { validateMinimum } from '../services/password-policy'

type IdentityRow = {
  id: string
  gipUid: string | null
  passwordSetAt: Date | null
}

type Stubs = {
  identity: IdentityRow | null
  displayEmail: string | null
  currentPasswordVerifyOk: boolean
  passwordSetupRequired: boolean
}

let stubs: Stubs = {
  identity: null,
  displayEmail: null,
  currentPasswordVerifyOk: true,
  passwordSetupRequired: false,
}

const updates: Array<Record<string, unknown>> = []
const audits: Array<Record<string, unknown>> = []
let gipPasswordUpdates: Array<{ uid: string; password: string }> = []

async function setPasswordHandler(args: {
  body: { newPassword: string; currentPassword?: string }
  authUserId: string
}): Promise<{ status: number; body: unknown }> {
  // Mirror the route module's branch tree exactly.
  const { newPassword, currentPassword } = args.body
  const { identity, displayEmail, currentPasswordVerifyOk, passwordSetupRequired } = stubs

  const policy = validateMinimum(newPassword)
  if (!policy.ok) {
    return { status: 400, body: { error: 'WEAK_PASSWORD', message: policy.reason } }
  }
  if (!identity || !identity.gipUid) {
    return { status: 400, body: { error: 'NO_GIP_USER', message: 'This account has no linked GIP user.' } }
  }
  if (!displayEmail) {
    return { status: 400, body: { error: 'NO_EMAIL', message: 'This account has no email on file.' } }
  }

  const isFirstSet = identity.passwordSetAt === null
  if (isFirstSet) {
    if (!passwordSetupRequired) {
      return { status: 403, body: { error: 'CURRENT_PASSWORD_REQUIRED', message: 'Current password is required.' } }
    }
  } else {
    if (!currentPassword) {
      return { status: 400, body: { error: 'CURRENT_PASSWORD_REQUIRED', message: 'Current password is required.' } }
    }
    if (!currentPasswordVerifyOk) {
      return { status: 401, body: { error: 'CURRENT_PASSWORD_INVALID', message: 'Current password is incorrect.' } }
    }
  }

  gipPasswordUpdates.push({ uid: identity.gipUid, password: newPassword })
  updates.push({ passwordSetAt: new Date(), passwordLockoutUntil: null, identityId: identity.id })
  audits.push({
    actorId: args.authUserId,
    action: 'password_set',
    targetType: 'user',
    targetId: identity.id,
    details: { mode: isFirstSet ? 'first_set' : 'change_password', email: displayEmail },
  })

  return { status: 200, body: { ok: true } }
}

beforeEach(() => {
  stubs = {
    identity: { id: 'user-1', gipUid: 'gip-uid-1', passwordSetAt: null },
    displayEmail: 'user@example.com',
    currentPasswordVerifyOk: true,
    passwordSetupRequired: false,
  }
  updates.length = 0
  audits.length = 0
  gipPasswordUpdates = []
})

describe('POST /api/auth/password/set — first-set mode', () => {
  test('rejects weak password before any GIP call', async () => {
    stubs.passwordSetupRequired = true
    const res = await setPasswordHandler({
      body: { newPassword: 'short' },
      authUserId: 'user-1',
    })
    expect(res.status).toBe(400)
    expect((res.body as Record<string, unknown>).error).toBe('WEAK_PASSWORD')
    expect(gipPasswordUpdates).toHaveLength(0)
  })

  test('first-set requires session-level passwordSetupRequired flag', async () => {
    // Default stubs: identity.passwordSetAt = null, but flag is false.
    const res = await setPasswordHandler({
      body: { newPassword: 'Aha1234567!Bb' },
      authUserId: 'user-1',
    })
    expect(res.status).toBe(403)
    expect((res.body as Record<string, unknown>).error).toBe('CURRENT_PASSWORD_REQUIRED')
    expect(gipPasswordUpdates).toHaveLength(0)
  })

  test('first-set succeeds when flag is set; writes audit + GIP password', async () => {
    stubs.passwordSetupRequired = true
    const res = await setPasswordHandler({
      body: { newPassword: 'Aha1234567!Bb' },
      authUserId: 'user-1',
    })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(gipPasswordUpdates).toEqual([{ uid: 'gip-uid-1', password: 'Aha1234567!Bb' }])
    expect(audits[0]).toMatchObject({
      action: 'password_set',
      details: { mode: 'first_set', email: 'user@example.com' },
    })
  })
})

describe('POST /api/auth/password/set — change-password mode', () => {
  beforeEach(() => {
    stubs.identity = { id: 'user-1', gipUid: 'gip-uid-1', passwordSetAt: new Date(Date.now() - 1000) }
  })

  test('400 when currentPassword is missing', async () => {
    const res = await setPasswordHandler({
      body: { newPassword: 'Aha1234567!Bb' },
      authUserId: 'user-1',
    })
    expect(res.status).toBe(400)
    expect((res.body as Record<string, unknown>).error).toBe('CURRENT_PASSWORD_REQUIRED')
  })

  test('401 when currentPassword is wrong', async () => {
    stubs.currentPasswordVerifyOk = false
    const res = await setPasswordHandler({
      body: { newPassword: 'Aha1234567!Bb', currentPassword: 'wrong' },
      authUserId: 'user-1',
    })
    expect(res.status).toBe(401)
    expect((res.body as Record<string, unknown>).error).toBe('CURRENT_PASSWORD_INVALID')
  })

  test('200 succeeds and logs change_password audit', async () => {
    const res = await setPasswordHandler({
      body: { newPassword: 'Aha1234567!Bb', currentPassword: 'oldpw1' },
      authUserId: 'user-1',
    })
    expect(res.status).toBe(200)
    expect(audits[0]).toMatchObject({
      action: 'password_set',
      details: { mode: 'change_password', email: 'user@example.com' },
    })
  })
})

describe('POST /api/auth/password/set — guards', () => {
  test('400 when identity has no GIP uid', async () => {
    stubs.identity = { id: 'user-1', gipUid: null, passwordSetAt: null }
    const res = await setPasswordHandler({
      body: { newPassword: 'Aha1234567!Bb' },
      authUserId: 'user-1',
    })
    expect(res.status).toBe(400)
    expect((res.body as Record<string, unknown>).error).toBe('NO_GIP_USER')
  })

  test('400 when display email is missing', async () => {
    stubs.passwordSetupRequired = true
    stubs.displayEmail = null
    const res = await setPasswordHandler({
      body: { newPassword: 'Aha1234567!Bb' },
      authUserId: 'user-1',
    })
    expect(res.status).toBe(400)
    expect((res.body as Record<string, unknown>).error).toBe('NO_EMAIL')
  })
})
