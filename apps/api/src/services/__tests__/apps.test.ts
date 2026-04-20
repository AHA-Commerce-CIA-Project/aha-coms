import { beforeEach, describe, expect, mock, test } from 'bun:test'

const insertedValues: Array<Record<string, unknown>> = []
const updatedValues: Array<Record<string, unknown>> = []
let currentApp: Record<string, unknown> | null = null

const db = {
  insert: (_table: unknown) => ({
    values(value: Record<string, unknown>) {
      insertedValues.push(value)
      currentApp = {
        id: 'app-1',
        ...value,
      }
      return {
        returning: async () => [{ id: 'app-1' }],
      }
    },
  }),
  update: (_table: unknown) => ({
    set(value: Record<string, unknown>) {
      updatedValues.push(value)
      currentApp = currentApp ? { ...currentApp, ...value } : currentApp
      return {
        where: async (_condition: unknown) => undefined,
      }
    },
  }),
  query: {
    appRegistry: {
      findFirst: async () => currentApp,
    },
  },
}

mock.module('~/db', () => ({ db }))
mock.module('~/db/schema', () => ({
  appRegistry: { id: 'app_registry.id' },
  // Added in the SSO upgrade — barrel re-exports these new schema tables
  sessionRevocations: { userId: 'sessionRevocations.userId' },
  appWebhookEndpoints: { id: 'appWebhookEndpoints.id' },
}))
mock.module('drizzle-orm', () => ({
  eq: (left: unknown, right: unknown) => ({ left, right }),
  // sql and relations needed by the schema barrel's new re-exports
  sql: new Proxy(
    (strings: TemplateStringsArray) => strings.join(''),
    { get: (_t, prop) => prop },
  ),
  relations: () => ({}),
  and: (...conditions: unknown[]) => ({ conditions }),
}))

const {
  AppIntegrationValidationError,
  registerApp,
  updateApp,
  resolveAppIntegrationMetadata,
  validateAppIntegrationMetadata,
} = await import('../apps')

describe('app integration metadata validation', () => {
  beforeEach(() => {
    insertedValues.length = 0
    updatedValues.length = 0
    currentApp = {
      id: 'app-1',
      slug: 'heroes',
      name: 'Heroes',
      url: 'https://heroes.ahacommerce.net',
      basePath: '/',
      adapterType: 'server_middleware',
      transportMode: 'portable_token',
      handoffMode: 'one_time_code',
      brokerOrigin: 'https://coms.ahacommerce.net',
      contractVersion: 1,
      complianceStatus: 'draft',
      manifestPath: null,
      lastVerifiedAt: null,
      status: 'active',
    }
  })

  test('fills defaults for portable-token apps', () => {
    const metadata = resolveAppIntegrationMetadata({
      transportMode: 'portable_token',
      brokerOrigin: 'https://coms.ahacommerce.net',
    })

    expect(metadata).toMatchObject({
      adapterType: 'server_middleware',
      transportMode: 'portable_token',
      handoffMode: 'one_time_code',
      complianceStatus: 'draft',
      contractVersion: 1,
    })
  })

  test('reports compliance and transport mismatches', () => {
    const errors = validateAppIntegrationMetadata({
      adapterType: 'server_middleware',
      transportMode: 'portable_token',
      handoffMode: 'none',
      brokerOrigin: null,
      contractVersion: 1,
      complianceStatus: 'compliant',
      manifestPath: null,
      lastVerifiedAt: null,
    })

    expect(errors).toEqual([
      'portable_token transport requires a brokered handoff mode',
      'portable_token transport requires brokerOrigin',
      'complianceStatus requires manifestPath',
      'compliant apps require lastVerifiedAt',
    ])
  })

  test('rejects invalid app registration metadata', async () => {
    await expect(
      registerApp({
        slug: 'orbit',
        name: 'Orbit',
        url: 'https://orbit.ahacommerce.net',
        basePath: '/',
        adapterType: 'server_middleware',
        transportMode: 'same_host_cookie',
        handoffMode: 'token_exchange',
        brokerOrigin: 'https://coms.ahacommerce.net',
        contractVersion: 1,
        complianceStatus: 'draft',
        manifestPath: null,
        lastVerifiedAt: null,
        status: 'active',
      }),
    ).rejects.toBeInstanceOf(AppIntegrationValidationError)
  })

  test('rejects updates that make a compliant app unverifiable', async () => {
    currentApp = {
      ...currentApp,
      complianceStatus: 'compliant',
      manifestPath: 'portal.integration.json',
      lastVerifiedAt: new Date('2026-04-17T00:00:00Z'),
    }

    await expect(
      updateApp('app-1', {
        transportMode: 'portable_token',
        handoffMode: 'none',
      }),
    ).rejects.toBeInstanceOf(AppIntegrationValidationError)
  })

  test('allows compliant updates when brokered metadata is complete', async () => {
    await updateApp('app-1', {
      complianceStatus: 'planned',
      manifestPath: 'portal.integration.json',
      brokerOrigin: 'https://coms.ahacommerce.net',
    })

    expect(updatedValues).toHaveLength(1)
    expect(updatedValues[0]).toMatchObject({
      complianceStatus: 'planned',
      manifestPath: 'portal.integration.json',
    })
  })
})
