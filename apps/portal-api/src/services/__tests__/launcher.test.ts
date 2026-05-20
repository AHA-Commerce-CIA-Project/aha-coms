/**
 * Launcher service — the canonical source for the AccountWidget launcher
 * list and the dashboard ServiceBar tab list.
 *
 * Both helpers used to live inline inside the userinfo + dashboard route
 * handlers; the portal-web SSR layout reached them via HTTP loopback
 * (event.fetch). The loopback path silently failed in prod (cookie
 * forwarding + cold-start nuance across two Cloud Run services through
 * Firebase Hosting), so the chrome rendered with no tabs and the
 * widget's app switcher was empty.
 *
 * Lifting these queries into a service lets the layout call them
 * in-process — the same pattern hooks.server.ts already uses for
 * validateSession.
 */
import { beforeEach, describe, expect, test } from 'bun:test'
import { fullDrizzleOrmMock, fullSchemaBarrelMock, mockSpecs } from '~/test-helpers/schema-barrel-mock'
import { mock } from 'bun:test'

// ---------------------------------------------------------------------------
// Module mocks — mirror the chainable-thenable shape userinfo.test.ts uses.
// ---------------------------------------------------------------------------

interface MockApp {
  id: string
  slug: string
  name: string
  description: string | null
  url: string
  iconUrl: string | null
  status: string
  healthStatus: string
  lastHealthCheckAt: Date | null
}

let mockApps: MockApp[] = []

function setMockApps(apps: MockApp[]) {
  mockApps = apps
}

function makeThenable(): {
  from: () => unknown
  then: (resolve: (v: unknown) => void) => void
  where: (predicate?: unknown) => Promise<unknown>
} {
  return {
    from: () => makeThenable(),
    then: (resolve: (v: unknown) => void) => resolve(mockApps),
    where: (predicate?: unknown) => {
      // Honour the inArray(slug, [...]) predicate the launcher emits — the
      // service should only return rows for slugs the user actually has.
      const isSlugFilter =
        predicate !== null &&
        typeof predicate === 'object' &&
        (predicate as { type?: string }).type === 'inArray' &&
        (predicate as { left?: unknown }).left === 'appRegistry.slug'
      if (isSlugFilter) {
        const requested = ((predicate as { values?: unknown }).values ?? []) as string[]
        return Promise.resolve(mockApps.filter((a) => requested.includes(a.slug)))
      }
      return Promise.resolve(mockApps)
    },
  }
}

const db = {
  select: () => makeThenable(),
}

mock.module('~/db', () => ({ db }))
mock.module('~/db/schema', () => fullSchemaBarrelMock())
mock.module('drizzle-orm', () => fullDrizzleOrmMock())

// ---------------------------------------------------------------------------
// Module under test — imported after the mocks are registered.
// ---------------------------------------------------------------------------

const { getLauncherAppsForUser, getDashboardAppsForUser } = await import('../launcher')

const FULL_HEROES: MockApp = {
  id: 'app-heroes',
  slug: 'heroes',
  name: 'Heroes',
  description: 'Recognition platform',
  url: 'https://heroes.ahacommerce.net',
  iconUrl: null,
  status: 'active',
  healthStatus: 'healthy',
  lastHealthCheckAt: new Date('2026-05-20T00:00:00Z'),
}

const FULL_FAST: MockApp = {
  id: 'app-fast',
  slug: 'fast',
  name: 'Fast',
  description: 'Task tracker',
  url: 'https://aha-coms.web.app/fast',
  iconUrl: null,
  status: 'active',
  healthStatus: 'healthy',
  lastHealthCheckAt: new Date('2026-05-20T00:00:00Z'),
}

beforeEach(() => {
  setMockApps([FULL_HEROES, FULL_FAST])
})

// ---------------------------------------------------------------------------
// getLauncherAppsForUser
// ---------------------------------------------------------------------------

describe('getLauncherAppsForUser', () => {
  test('returns only the COMS hub when the user has no app access', async () => {
    const result = await getLauncherAppsForUser({ apps: [] })
    expect(result).toEqual([
      { slug: 'portal', label: 'COMS', url: '/portal/dashboard' },
    ])
  })

  test('prepends the COMS hub and appends the user\'s registered apps', async () => {
    const result = await getLauncherAppsForUser({ apps: ['heroes'] })
    expect(result).toEqual([
      { slug: 'portal', label: 'COMS', url: '/portal/dashboard' },
      { slug: 'heroes', label: 'Heroes', url: 'https://heroes.ahacommerce.net' },
    ])
  })

  test('filters the registry result to the user\'s apps claim', async () => {
    // The registry contains heroes + fast; the user only has heroes — the
    // launcher must not surface fast even though it sits in the table.
    const result = await getLauncherAppsForUser({ apps: ['heroes'] })
    expect(result.find((r) => r.slug === 'fast')).toBeUndefined()
  })

  test('returns the hub entry first, before any registered apps', async () => {
    const result = await getLauncherAppsForUser({ apps: ['heroes', 'fast'] })
    expect(result[0]).toEqual({ slug: 'portal', label: 'COMS', url: '/portal/dashboard' })
  })
})

// ---------------------------------------------------------------------------
// getDashboardAppsForUser
// ---------------------------------------------------------------------------

describe('getDashboardAppsForUser', () => {
  test('returns an empty array when the user has no app access', async () => {
    const result = await getDashboardAppsForUser({ apps: [] })
    expect(result).toEqual([])
  })

  test('returns the dashboard row shape for the user\'s apps', async () => {
    const result = await getDashboardAppsForUser({ apps: ['heroes'] })
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(FULL_HEROES)
  })

  test('returns multiple rows when the user has multiple apps', async () => {
    const result = await getDashboardAppsForUser({ apps: ['heroes', 'fast'] })
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.slug).sort()).toEqual(['fast', 'heroes'])
  })
})
