import { beforeEach, describe, expect, mock, test } from 'bun:test'

// ---------------------------------------------------------------------------
// Stubs — set up before importing the module under test
// ---------------------------------------------------------------------------

const identityUsers = { id: 'identityUsers.id' }
const teamMembers = { teamId: 'teamMembers.teamId', userId: 'teamMembers.userId' }
const teamAppAccess = { teamId: 'teamAppAccess.teamId', appId: 'teamAppAccess.appId' }
const appRegistry = { id: 'appRegistry.id', slug: 'appRegistry.slug' }

// In-memory user
type UserRecord = {
  id: string
  gipUid: string | null
  email: string
  name: string
  portalRole: string
  status: string
}

let currentUser: UserRecord | null = null

// Slugs returned by the resolveUserState helper inside provisioning-events.
// Each .select().from().where() call goes through this counter.
let appSlugsForUser: string[] = []
let selectCallCount = 0

const db = {
  query: {
    identityUsers: {
      findFirst: async () => currentUser,
    },
  },
  select: (_fields: unknown) => ({
    from: (_table: unknown) => ({
      where: async () => {
        selectCallCount++
        if (selectCallCount === 1) {
          // teamMembers step
          return appSlugsForUser.length > 0 ? [{ teamId: 'team-1' }] : []
        }
        if (selectCallCount === 2) {
          // teamAppAccess step
          return appSlugsForUser.length > 0 ? [{ appId: 'app-1' }] : []
        }
        // appRegistry step
        return appSlugsForUser.map((slug) => ({ slug }))
      },
    }),
  }),
}

mock.module('~/db', () => ({ db }))
mock.module('~/db/schema', () => ({
  identityUsers,
  teamMembers,
  teamAppAccess,
  appRegistry,
}))
mock.module('drizzle-orm', () => ({
  eq: (left: unknown, right: unknown) => ({ left, right }),
  inArray: (left: unknown, right: unknown) => ({ left, right }),
  // sql and relations needed by schema files loaded through the ~/db/schema barrel
  sql: new Proxy(
    (strings: TemplateStringsArray) => strings.join(''),
    { get: (_t, prop) => prop },
  ),
  relations: () => ({}),
  and: (...conditions: unknown[]) => ({ conditions }),
}))

// Mock the dispatcher via the dedicated re-export shim.
// Bun's `mock.module` is process-global and registered at file load, so a
// partial mock of '../webhook-dispatcher' leaks into webhook-dispatcher.test.ts
// and worker tests, breaking imports of signWebhookBody / verifyWebhookSignature
// / deliverWebhook there. Mocking the shim keeps the dispatcher untouched.
const dispatchPortalWebhook = mock(async () => undefined)
mock.module('../portal-webhook-fanout', () => ({ dispatchPortalWebhook }))

const { emitUserProvisioned, emitUserUpdated, emitUserOffboarded } =
  await import('../provisioning-events')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setUser(overrides: Partial<UserRecord> = {}) {
  currentUser = {
    id: 'user-1',
    gipUid: 'gip-uid-1',
    email: 'user@example.com',
    name: 'Test User',
    portalRole: 'employee',
    status: 'active',
    ...overrides,
  }
}

function resetState() {
  currentUser = null
  appSlugsForUser = []
  selectCallCount = 0
  dispatchPortalWebhook.mockClear()
}

// ---------------------------------------------------------------------------
// 7. Provisioning fanout smoke tests
// ---------------------------------------------------------------------------

describe('emitUserProvisioned', () => {
  beforeEach(resetState)

  test('calls dispatchPortalWebhook with user.provisioned and the user app list', async () => {
    setUser()
    appSlugsForUser = ['heroes', 'orbit']

    await emitUserProvisioned('user-1')

    expect(dispatchPortalWebhook).toHaveBeenCalledTimes(1)
    const [event, payload, opts] = dispatchPortalWebhook.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
      { appSlugs: string[] } | undefined,
    ]
    expect(event).toBe('user.provisioned')
    expect(payload.userId).toBe('user-1')
    expect(payload.email).toBe('user@example.com')
    expect((payload.apps as string[]).sort()).toEqual(['heroes', 'orbit'])
    expect(opts?.appSlugs?.sort()).toEqual(['heroes', 'orbit'])
  })

  test('handles users with no apps — still calls dispatcher with undefined appSlugs', async () => {
    setUser()
    // appSlugsForUser = [] — no team memberships

    await emitUserProvisioned('user-1')

    // The impl calls dispatchPortalWebhook with appSlugs: undefined when slug list is empty.
    // dispatchPortalWebhook will find zero subscribed endpoints and be a no-op internally.
    expect(dispatchPortalWebhook).toHaveBeenCalledTimes(1)
    const [, , opts] = dispatchPortalWebhook.mock.calls[0] as unknown as [unknown, unknown, { appSlugs?: string[] }]
    // appSlugs is undefined when user has no apps
    expect(opts?.appSlugs).toBeUndefined()
  })

  test('does nothing when user is not found', async () => {
    currentUser = null

    await emitUserProvisioned('nonexistent')

    expect(dispatchPortalWebhook).not.toHaveBeenCalled()
  })
})

describe('emitUserOffboarded', () => {
  beforeEach(resetState)

  test('calls dispatchPortalWebhook with user.offboarded and the user app list', async () => {
    setUser()
    appSlugsForUser = ['heroes']

    await emitUserOffboarded('user-1')

    expect(dispatchPortalWebhook).toHaveBeenCalledTimes(1)
    const [event, payload, opts] = dispatchPortalWebhook.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
      { appSlugs: string[] } | undefined,
    ]
    expect(event).toBe('user.offboarded')
    expect(payload.userId).toBe('user-1')
    expect(payload.email).toBe('user@example.com')
    expect(payload.offboardedAt).toBeString()
    expect(opts?.appSlugs).toEqual(['heroes'])
  })

  test('handles users with no apps', async () => {
    setUser()

    await emitUserOffboarded('user-1')

    expect(dispatchPortalWebhook).toHaveBeenCalledTimes(1)
    const [, , opts] = dispatchPortalWebhook.mock.calls[0] as unknown as [unknown, unknown, { appSlugs?: string[] }]
    expect(opts?.appSlugs).toBeUndefined()
  })

  test('does nothing when user row is gone', async () => {
    currentUser = null

    await emitUserOffboarded('nonexistent')

    expect(dispatchPortalWebhook).not.toHaveBeenCalled()
  })
})

describe('emitUserUpdated', () => {
  beforeEach(resetState)

  test('calls dispatchPortalWebhook with user.updated and the changedFields array', async () => {
    setUser()
    appSlugsForUser = ['heroes']

    await emitUserUpdated('user-1', ['email', 'portalRole'])

    expect(dispatchPortalWebhook).toHaveBeenCalledTimes(1)
    const [event, payload, opts] = dispatchPortalWebhook.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
      { appSlugs: string[] } | undefined,
    ]
    expect(event).toBe('user.updated')
    expect(payload.changedFields).toEqual(['email', 'portalRole'])
    expect(payload.userId).toBe('user-1')
    expect(opts?.appSlugs).toEqual(['heroes'])
  })

  test('handles users with no apps', async () => {
    setUser()

    await emitUserUpdated('user-1', ['name'])

    expect(dispatchPortalWebhook).toHaveBeenCalledTimes(1)
    const [, , opts] = dispatchPortalWebhook.mock.calls[0] as unknown as [unknown, unknown, { appSlugs?: string[] }]
    expect(opts?.appSlugs).toBeUndefined()
  })

  test('does nothing when user is not found', async () => {
    currentUser = null

    await emitUserUpdated('nonexistent', ['email'])

    expect(dispatchPortalWebhook).not.toHaveBeenCalled()
  })
})
