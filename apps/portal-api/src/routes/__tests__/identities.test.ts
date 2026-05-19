/**
 * POST /v1/identities — admin-side affordance route tests (Spec 06 PR F).
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'

// ---------------------------------------------------------------------------
// Mock requireRole — default: admin allowed
// ---------------------------------------------------------------------------

let isAdmin = true

mock.module('~/middleware/rbac', () => ({
  requireRole: (..._roles: string[]) =>
    new Elysia({ name: 'mock-require-role-identities' }).derive({ as: 'scoped' }, async ({ status }) => {
      if (!isAdmin) throw status(403, { message: 'Insufficient portal role' })
      return {
        authUser: {
          id: 'admin-1',
          email: 'admin@test.com',
          name: 'Admin',
          portalRole: 'admin',
          gipUid: 'gip-admin',
          teamIds: [],
          apps: [],
        },
      }
    }),
}))

// ---------------------------------------------------------------------------
// Mock identities service
// ---------------------------------------------------------------------------

const { WeakPasswordError, DuplicateEmailError } = await import('../../services/identities')

const createIdentityWithPasswordMock = mock(
  async (_input: { name: string; email: string; password: string; notes?: string }) => ({
    id: 'identity-1',
    gipUid: 'gip-uid-1',
  }),
)

mock.module('~/services/identities', () => ({
  createIdentityWithPassword: createIdentityWithPasswordMock,
  WeakPasswordError,
  DuplicateEmailError,
}))
mock.module('../../services/identities', () => ({
  createIdentityWithPassword: createIdentityWithPasswordMock,
  WeakPasswordError,
  DuplicateEmailError,
}))

// ---------------------------------------------------------------------------
// Mock audit
// ---------------------------------------------------------------------------

const logAuditMock = mock(async () => {})
mock.module('~/services/audit', () => ({ logAudit: logAuditMock }))
mock.module('../../services/audit', () => ({ logAudit: logAuditMock }))

const { identityRoutes } = await import('../identities')

function post(body: unknown) {
  return identityRoutes.handle(
    new Request('http://localhost/identities/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

describe('POST /v1/identities', () => {
  beforeEach(() => {
    isAdmin = true
    createIdentityWithPasswordMock.mockClear()
    createIdentityWithPasswordMock.mockImplementation(async () => ({
      id: 'identity-1',
      gipUid: 'gip-uid-1',
    }))
    logAuditMock.mockClear()
  })

  test('happy path — 200 with id + gipUid + audit logged', async () => {
    const res = await post({
      name: 'Tools Bot',
      email: 'tools-bot@internal.com',
      password: 'Aha1234567!Bb',
      notes: 'CI account',
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({ id: 'identity-1', gipUid: 'gip-uid-1', provisioningStatus: 'ready' })

    expect(createIdentityWithPasswordMock).toHaveBeenCalledTimes(1)
    expect(logAuditMock).toHaveBeenCalledTimes(1)
    const [auditCall] = (logAuditMock.mock.calls as unknown as Array<[Record<string, unknown>]>)[0] ?? [{}]
    expect(auditCall).toMatchObject({
      actorId: 'admin-1',
      action: 'create_identity_with_password',
      targetType: 'user',
      targetId: 'identity-1',
    })
    expect(auditCall.details).toMatchObject({
      email: 'tools-bot@internal.com',
      kind: 'personal',
      notes: 'CI account',
    })
  })

  test('403 when caller is not admin', async () => {
    isAdmin = false
    const res = await post({
      name: 'X',
      email: 'x@y.com',
      password: 'Aha1234567!Bb',
    })
    expect(res.status).toBe(403)
  })

  test('400 when body invalid (missing email)', async () => {
    const res = await post({
      name: 'X',
      password: 'Aha1234567!Bb',
    })
    expect(res.status).toBe(422)
  })

  test('400 when password is weak', async () => {
    createIdentityWithPasswordMock.mockImplementationOnce(async () => {
      throw new WeakPasswordError('Password must contain at least one digit.')
    })
    const res = await post({
      name: 'X',
      email: 'x@y.com',
      password: 'Strongabc',
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe('WEAK_PASSWORD')
  })

  test('409 when email is duplicate', async () => {
    createIdentityWithPasswordMock.mockImplementationOnce(async () => {
      throw new DuplicateEmailError('dup@y.com')
    })
    const res = await post({
      name: 'X',
      email: 'dup@y.com',
      password: 'Aha1234567!Bb',
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe('DUPLICATE_EMAIL')
  })
})
