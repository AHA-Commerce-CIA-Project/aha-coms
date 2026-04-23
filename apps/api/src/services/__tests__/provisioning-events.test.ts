import { beforeEach, describe, expect, mock, test } from 'bun:test'

// ---------------------------------------------------------------------------
// Stubs — set up before importing the module under test
// ---------------------------------------------------------------------------

const identityUsers = { id: 'identityUsers.id' }
const teamMembers = { teamId: 'teamMembers.teamId', userId: 'teamMembers.userId' }
const teamAppAccess = { teamId: 'teamAppAccess.teamId', appId: 'teamAppAccess.appId', appRole: 'teamAppAccess.appRole' }
const appRegistry = { id: 'appRegistry.id', slug: 'appRegistry.slug', appRoles: 'appRegistry.appRoles' }

// In-memory user
type UserRecord = {
  id: string
  gipUid: string | null
  email: string
  name: string
  portalRole: string
  branch: string | null
  status: string
}

let currentUser: UserRecord | null = null

// Per-app data returned by the mock DB. Each entry represents an app the user
// has access to, including the team-app grant details and declared roles.
interface MockAppEntry {
  appId: string
  slug: string
  appRole: string | null
  appRoles: Array<{ key: string; label: string; default?: boolean; description?: string }>
}

let appsForUser: MockAppEntry[] = []

const db = {
  query: {
    identityUsers: {
      findFirst: async () => currentUser,
    },
  },
  select: (_fields: unknown) => ({
    from: (table: unknown) => ({
      where: async () => {
        if (table === teamMembers) {
          return appsForUser.length > 0 ? [{ teamId: 'team-1' }] : []
        }
        if (table === teamAppAccess) {
          // Used by both resolveUserState (needs .appId) and resolvePerAppContext (needs .appId + .appRole)
          return appsForUser.map((a) => ({ appId: a.appId, appRole: a.appRole }))
        }
        if (table === appRegistry) {
          // Used by both resolveUserState (needs .slug) and resolvePerAppContext (needs .id + .slug + .appRoles)
          return appsForUser.map((a) => ({
            id: a.appId,
            slug: a.slug,
            appRoles: a.appRoles,
          }))
        }
        return []
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
    branch: 'Thailand',
    status: 'active',
    ...overrides,
  }
}

function resetState() {
  currentUser = null
  appsForUser = []
  dispatchPortalWebhook.mockClear()
}

// ---------------------------------------------------------------------------
// 7. Provisioning fanout smoke tests
// ---------------------------------------------------------------------------

describe('emitUserProvisioned', () => {
  beforeEach(resetState)

  test('dispatches per-app with resolved appRole', async () => {
    setUser()
    appsForUser = [
      { appId: 'app-1', slug: 'heroes', appRole: null, appRoles: [
        { key: 'admin', label: 'Admin' },
        { key: 'employee', label: 'Employee', default: true },
      ] },
    ]

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
    // appRole resolved to the default role since no explicit team grant
    expect(payload.appRole).toBe('employee')
    expect(opts?.appSlugs).toEqual(['heroes'])
  })

  test('dispatches per-app with explicit grant role', async () => {
    setUser()
    appsForUser = [
      { appId: 'app-1', slug: 'heroes', appRole: 'leader', appRoles: [
        { key: 'admin', label: 'Admin' },
        { key: 'leader', label: 'Leader' },
        { key: 'employee', label: 'Employee', default: true },
      ] },
    ]

    await emitUserProvisioned('user-1')

    expect(dispatchPortalWebhook).toHaveBeenCalledTimes(1)
    const [, payload] = dispatchPortalWebhook.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(payload.appRole).toBe('leader')
  })

  test('dispatches once per app for multi-app users', async () => {
    setUser()
    appsForUser = [
      { appId: 'app-1', slug: 'heroes', appRole: null, appRoles: [] },
      { appId: 'app-2', slug: 'orbit', appRole: null, appRoles: [] },
    ]

    await emitUserProvisioned('user-1')

    // Per-app dispatch — one call per app
    expect(dispatchPortalWebhook).toHaveBeenCalledTimes(2)
    const slugs = dispatchPortalWebhook.mock.calls.map(
      (c: unknown) => ((c as unknown[])[2] as { appSlugs: string[] })?.appSlugs?.[0],
    )
    expect(slugs.sort()).toEqual(['heroes', 'orbit'])
  })

  test('appRole is null when app has no declared roles', async () => {
    setUser()
    appsForUser = [
      { appId: 'app-1', slug: 'heroes', appRole: null, appRoles: [] },
    ]

    await emitUserProvisioned('user-1')

    const [, payload] = dispatchPortalWebhook.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(payload.appRole).toBeNull()
  })

  test('does not dispatch when user has no apps', async () => {
    setUser()
    // appsForUser = [] — no team memberships / no apps

    await emitUserProvisioned('user-1')

    expect(dispatchPortalWebhook).not.toHaveBeenCalled()
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
    appsForUser = [
      { appId: 'app-1', slug: 'heroes', appRole: null, appRoles: [] },
    ]

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

  test('dispatches per-app with changedFields and resolved appRole', async () => {
    setUser()
    appsForUser = [
      { appId: 'app-1', slug: 'heroes', appRole: null, appRoles: [
        { key: 'employee', label: 'Employee', default: true },
      ] },
    ]

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
    expect(payload.appRole).toBe('employee')
    expect(opts?.appSlugs).toEqual(['heroes'])
  })

  test('does not dispatch when user has no apps', async () => {
    setUser()

    await emitUserUpdated('user-1', ['name'])

    expect(dispatchPortalWebhook).not.toHaveBeenCalled()
  })

  test('does nothing when user is not found', async () => {
    currentUser = null

    await emitUserUpdated('nonexistent', ['email'])

    expect(dispatchPortalWebhook).not.toHaveBeenCalled()
  })
})
