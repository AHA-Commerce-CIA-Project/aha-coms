import { beforeEach, describe, expect, mock, test } from 'bun:test'

const authHandoffs = {
  id: 'auth_handoffs.id',
  codeHash: 'auth_handoffs.code_hash',
  appSlug: 'auth_handoffs.app_slug',
  consumedAt: 'auth_handoffs.consumed_at',
  expiresAt: 'auth_handoffs.expires_at',
}

const handoffStore: Array<Record<string, unknown>> = []

// Registry of apps keyed by slug for the token-exchange lookup in exchangeBrokerHandoff.
const appRegistryStore: Record<string, Record<string, unknown>> = {}

const db = {
  insert: (_table: unknown) => ({
    values(value: Record<string, unknown>) {
      handoffStore.push({
        id: `handoff-${handoffStore.length + 1}`,
        createdAt: new Date(),
        consumedAt: null,
        ...value,
      })
      return Promise.resolve()
    },
  }),
  update: (_table: unknown) => ({
    set(value: Record<string, unknown>) {
      return {
        where: async (condition: { right: string }) => {
          const handoff = handoffStore.find((entry) => entry.id === condition.right)
          if (handoff) Object.assign(handoff, value)
        },
      }
    },
  }),
  query: {
    authHandoffs: {
      findFirst: async (opts: { where: { right?: unknown } }) => {
        const codeHash = opts.where.right
        return (
          handoffStore.find((entry) => {
            const isUnconsumed = entry.consumedAt == null
            const isMatchingCode = entry.codeHash === codeHash
            return isUnconsumed && isMatchingCode
          }) ?? null
        )
      },
    },
    appRegistry: {
      findFirst: async (opts: { where: { right?: unknown } }) => {
        const slug = opts.where.right as string
        return appRegistryStore[slug] ?? null
      },
    },
  },
}

mock.module('~/db', () => ({ db }))
mock.module('~/db/schema/apps', () => ({
  appRegistry: { slug: 'app_registry.slug' },
}))
mock.module('~/db/schema/auth-handoffs', () => ({
  authHandoffs,
}))
mock.module('drizzle-orm', () => ({
  eq: (left: unknown, right: unknown) => ({ type: 'eq', left, right }),
  // sql and relations needed by the ~/db/schema barrel's new re-exports
  // (session-revocations.ts and app-webhook-endpoints.ts added in SSO upgrade)
  sql: new Proxy(
    (strings: TemplateStringsArray) => strings.join(''),
    { get: (_t, prop) => prop },
  ),
  relations: () => ({}),
  and: (...conditions: unknown[]) => ({ conditions }),
}))

const {
  BrokerAuthorizationError,
  BrokerValidationError,
  createBrokerHandoff,
  exchangeBrokerHandoff,
} = await import('../auth-broker')

describe('auth broker', () => {
  beforeEach(() => {
    handoffStore.length = 0
    // Reset app registry store and seed known test apps for token-exchange lookups.
    for (const key of Object.keys(appRegistryStore)) delete appRegistryStore[key]
    const testApps = [
      { slug: 'heroes', url: 'https://heroes.example.com', transportMode: 'portable_token', handoffMode: 'one_time_code', brokerOrigin: 'https://coms.example.com', status: 'active', brokerSigningSecret: null },
      { slug: 'orbit', url: 'https://orbit.example.com', transportMode: 'portable_token', handoffMode: 'token_exchange', brokerOrigin: 'https://coms.example.com', status: 'active', brokerSigningSecret: null },
    ]
    for (const app of testApps) appRegistryStore[app.slug] = app
    process.env.PORTAL_BROKER_SIGNING_SECRET = 'test-broker-secret'
  })

  test('creates one-time-code handoffs for brokered apps', async () => {
    const response = await createBrokerHandoff(
      {
        slug: 'heroes',
        url: 'https://heroes.example.com',
        transportMode: 'portable_token',
        handoffMode: 'one_time_code',
        brokerOrigin: 'https://coms.example.com',
        status: 'active',
        brokerSigningSecret: null,
      },
      {
        id: 'user-1',
        gipUid: 'gip-1',
        email: 'user@example.com',
        name: 'User',
        portalRole: 'employee',
        teamIds: ['team-1'],
        apps: ['heroes'],
      },
      '/deep/link',
    )

    expect(response.handoffMode).toBe('one_time_code')
    expect(response.code).toBeString()
    expect(response.redirectUrl).toContain('portal_code=')
    expect(handoffStore).toHaveLength(1)
  })

  test('creates signed token handoffs when configured', async () => {
    const response = await createBrokerHandoff(
      {
        slug: 'orbit',
        url: 'https://orbit.example.com',
        transportMode: 'portable_token',
        handoffMode: 'token_exchange',
        brokerOrigin: 'https://coms.example.com',
        status: 'active',
        brokerSigningSecret: null,
      },
      {
        id: 'user-1',
        gipUid: 'gip-1',
        email: 'user@example.com',
        name: 'User',
        portalRole: 'admin',
        teamIds: ['team-1'],
        apps: ['orbit'],
      },
    )

    expect(response.handoffMode).toBe('token_exchange')
    expect(response.token).toBeString()
    expect(response.redirectUrl).toContain('portal_token=')
  })

  test('rejects access to apps outside the current claims', async () => {
    await expect(
      createBrokerHandoff(
        {
          slug: 'orbit',
          url: 'https://orbit.example.com',
          transportMode: 'portable_token',
          handoffMode: 'one_time_code',
          brokerOrigin: 'https://coms.example.com',
          status: 'active',
          brokerSigningSecret: null,
        },
        {
          id: 'user-1',
          gipUid: 'gip-1',
          email: 'user@example.com',
          name: 'User',
          portalRole: 'employee',
          teamIds: [],
          apps: ['heroes'],
        },
      ),
    ).rejects.toBeInstanceOf(BrokerAuthorizationError)
  })

  test('exchanges one-time codes exactly once', async () => {
    const handoff = await createBrokerHandoff(
      {
        slug: 'heroes',
        url: 'https://heroes.example.com',
        transportMode: 'portable_token',
        handoffMode: 'one_time_code',
        brokerOrigin: 'https://coms.example.com',
        status: 'active',
        brokerSigningSecret: null,
      },
      {
        id: 'user-1',
        gipUid: 'gip-1',
        email: 'user@example.com',
        name: 'User',
        portalRole: 'employee',
        teamIds: ['team-1'],
        apps: ['heroes'],
      },
    )

    const exchanged = await exchangeBrokerHandoff({
      appSlug: 'heroes',
      code: handoff.code!,
    })

    expect(exchanged.sessionUser.email).toBe('user@example.com')

    await expect(
      exchangeBrokerHandoff({
        appSlug: 'heroes',
        code: handoff.code!,
      }),
    ).rejects.toBeInstanceOf(BrokerValidationError)
  })

  test('exchanges signed broker tokens', async () => {
    const handoff = await createBrokerHandoff(
      {
        slug: 'orbit',
        url: 'https://orbit.example.com',
        transportMode: 'portable_token',
        handoffMode: 'token_exchange',
        brokerOrigin: 'https://coms.example.com',
        status: 'active',
        brokerSigningSecret: null,
      },
      {
        id: 'user-1',
        gipUid: 'gip-1',
        email: 'user@example.com',
        name: 'User',
        portalRole: 'admin',
        teamIds: ['team-1'],
        apps: ['orbit'],
      },
    )

    const exchanged = await exchangeBrokerHandoff({
      appSlug: 'orbit',
      token: handoff.token!,
    })

    expect(exchanged.sessionUser.portalRole).toBe('admin')
    expect(exchanged.appSlug).toBe('orbit')
  })
})
