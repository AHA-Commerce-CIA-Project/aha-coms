/**
 * Tests that user.provisioned and user.updated webhook payloads include the
 * additive `emails: UserEmailEntry[]` array introduced by Spec 06 PR A (Q8c).
 *
 * These tests are spec-defined (Q11) and focus narrowly on the shape of the
 * dispatched payload. They overlap with provisioning-events.test.ts by design —
 * the overlap makes the spec invariant explicit in its own file.
 *
 * Strategy: stub the DB and mock dispatchPortalWebhook; assert on the captured
 * call arguments. Uses the same inline-mock pattern as the other service tests.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { fullDrizzleOrmMock, fullSchemaBarrelMock } from '~/test-helpers/schema-barrel-mock'

// ---------------------------------------------------------------------------
// Sentinel table objects (reference-equality matching in select stub)
// ---------------------------------------------------------------------------

const identityUsers = { id: 'identityUsers.id' }
const teamMembers = { teamId: 'teamMembers.teamId', userId: 'teamMembers.userId' }
const teamAppAccess = { teamId: 'teamAppAccess.teamId', appId: 'teamAppAccess.appId' }
const appRegistry = {
  id: 'appRegistry.id',
  slug: 'appRegistry.slug',
  appRoles: 'appRegistry.appRoles',
}
const memberAppRole = {
  userId: 'memberAppRole.userId',
  appId: 'memberAppRole.appId',
  appRole: 'memberAppRole.appRole',
}
const appUserConfig = {
  portalSub: 'appUserConfig.portalSub',
  appId: 'appUserConfig.appId',
  config: 'appUserConfig.config',
  schemaVersion: 'appUserConfig.schemaVersion',
}

// ---------------------------------------------------------------------------
// In-memory user and app state
// ---------------------------------------------------------------------------

type UserRecord = {
  id: string
  gipUid: string | null
  name: string
  portalRole: string
  branch: string | null
  status: string
}

type EmailEntry = {
  address: string
  kind: 'workspace' | 'personal'
  isPrimary: boolean
  verified: boolean
  addedBy: 'admin' | 'self' | 'csv_import' | 'sheet_sync' | 'backfill' | 'bootstrap'
}

type AppEntry = {
  appId: string
  slug: string
  memberRole: string | null
  appRoles: Array<{ key: string; label: string; default?: boolean }>
}

let currentUser: UserRecord | null = null
let emailEntries: EmailEntry[] = []
let appsForUser: AppEntry[] = []

// ---------------------------------------------------------------------------
// DB mock — select chain with inArray support for multi-table resolution
// ---------------------------------------------------------------------------

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
          return appsForUser.map((a) => ({ appId: a.appId }))
        }
        if (table === appRegistry) {
          return appsForUser.map((a) => ({
            id: a.appId,
            slug: a.slug,
            appRoles: a.appRoles,
          }))
        }
        if (table === memberAppRole) {
          return appsForUser
            .filter((a) => a.memberRole !== null)
            .map((a) => ({ appId: a.appId, appRole: a.memberRole }))
        }
        if (table === appUserConfig) {
          return []
        }
        return []
      },
    }),
  }),
}

mock.module('~/db', () => ({ db }))
mock.module('~/db/schema', () => ({
  ...fullSchemaBarrelMock(),
  identityUsers,
  teamMembers,
  teamAppAccess,
  appRegistry,
  memberAppRole,
  appUserConfig,
}))
mock.module('drizzle-orm', () => fullDrizzleOrmMock())

const dispatchPortalWebhook = mock(async () => undefined)
mock.module('../services/portal-webhook-fanout', () => ({ dispatchPortalWebhook }))

// Mock email-resolution to return controlled email entries (avoids select/orderBy chain)
mock.module('../services/email-resolution', () => ({
  getDisplayEmail: async (_userId: string): Promise<string | null> => {
    const ws = emailEntries.find((e) => e.kind === 'workspace')
    const primary = emailEntries.find((e) => e.isPrimary)
    return ws?.address ?? primary?.address ?? emailEntries[0]?.address ?? null
  },
  getEmailEntries: async (_userId: string): Promise<EmailEntry[]> => emailEntries,
}))

const { emitUserProvisioned, emitUserUpdated } = await import('../services/provisioning-events')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setUser(overrides: Partial<UserRecord> = {}): void {
  currentUser = {
    id: 'user-1',
    gipUid: 'gip-uid-1',
    name: 'Alice',
    portalRole: 'employee',
    branch: 'Thailand',
    status: 'active',
    ...overrides,
  }
}

function seedTwoEmails(): void {
  emailEntries = [
    {
      address: 'alice@ahacommerce.net',
      kind: 'workspace',
      isPrimary: true,
      verified: true,
      addedBy: 'admin',
    },
    {
      address: 'alice.personal@gmail.com',
      kind: 'personal',
      isPrimary: false,
      verified: true,
      addedBy: 'self',
    },
  ]
}

function seedOneApp(): void {
  appsForUser = [
    {
      appId: 'app-1',
      slug: 'heroes',
      memberRole: null,
      appRoles: [{ key: 'employee', label: 'Employee', default: true }],
    },
  ]
}

function resetState(): void {
  currentUser = null
  emailEntries = []
  appsForUser = []
  dispatchPortalWebhook.mockClear()
}

beforeEach(resetState)

// ---------------------------------------------------------------------------
// Tests: user.provisioned emails shape (Q8c)
// ---------------------------------------------------------------------------

describe('user.provisioned payload — emails array (Q8c)', () => {
  test('payload includes emails array with both workspace and personal entries', async () => {
    setUser()
    seedTwoEmails()
    seedOneApp()

    await emitUserProvisioned('user-1')

    expect(dispatchPortalWebhook).toHaveBeenCalledTimes(1)
    const [event, payload] = dispatchPortalWebhook.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ]

    expect(event).toBe('user.provisioned')
    expect(Array.isArray(payload.emails)).toBe(true)

    const emails = payload.emails as EmailEntry[]
    expect(emails).toHaveLength(2)

    const ws = emails.find((e) => e.kind === 'workspace')
    expect(ws).toBeDefined()
    expect(ws!.address).toBe('alice@ahacommerce.net')
    expect(ws!.isPrimary).toBe(true)
    expect(ws!.verified).toBe(true)

    const personal = emails.find((e) => e.kind === 'personal')
    expect(personal).toBeDefined()
    expect(personal!.address).toBe('alice.personal@gmail.com')
    expect(personal!.addedBy).toBe('self')
  })

  test('scalar email field is still present (additive — non-breaking)', async () => {
    setUser()
    seedTwoEmails()
    seedOneApp()

    await emitUserProvisioned('user-1')

    const [, payload] = dispatchPortalWebhook.mock.calls[0] as unknown as [string, Record<string, unknown>]
    // Scalar email resolves to the workspace address per Q8a precedence
    expect(typeof payload.email).toBe('string')
    expect(payload.email).toBe('alice@ahacommerce.net')
  })

  test('emails array is empty when user has no email entries', async () => {
    setUser()
    emailEntries = [] // no emails
    seedOneApp()

    await emitUserProvisioned('user-1')

    const [, payload] = dispatchPortalWebhook.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(Array.isArray(payload.emails)).toBe(true)
    expect((payload.emails as EmailEntry[])).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Tests: user.updated payload — emails array (Q8c)
// ---------------------------------------------------------------------------

describe('user.updated payload — emails array (Q8c)', () => {
  test('payload includes emails array with both workspace and personal entries', async () => {
    setUser()
    seedTwoEmails()
    seedOneApp()

    await emitUserUpdated('user-1', ['email', 'portalRole'])

    expect(dispatchPortalWebhook).toHaveBeenCalledTimes(1)
    const [event, payload] = dispatchPortalWebhook.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ]

    expect(event).toBe('user.updated')
    expect(Array.isArray(payload.emails)).toBe(true)

    const emails = payload.emails as EmailEntry[]
    expect(emails).toHaveLength(2)
    expect(emails.some((e) => e.kind === 'workspace')).toBe(true)
    expect(emails.some((e) => e.kind === 'personal')).toBe(true)
  })

  test('scalar email field is still present (additive — non-breaking)', async () => {
    setUser()
    seedTwoEmails()
    seedOneApp()

    await emitUserUpdated('user-1', ['name'])

    const [, payload] = dispatchPortalWebhook.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(typeof payload.email).toBe('string')
  })

  test('changedFields is correctly forwarded in payload', async () => {
    setUser()
    seedTwoEmails()
    seedOneApp()

    await emitUserUpdated('user-1', ['email', 'portalRole'])

    const [, payload] = dispatchPortalWebhook.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(payload.changedFields).toEqual(['email', 'portalRole'])
  })
})
