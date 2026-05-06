import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { fullDrizzleOrmMock, fullSchemaBarrelMock } from '~/test-helpers/schema-barrel-mock'

const insertedValues: Array<Record<string, unknown>> = []
const updatedValues: Array<Record<string, unknown>> = []
const manifestInsertedValues: Array<Record<string, unknown>> = []
let currentApp: Record<string, unknown> | null = null

function makeInsert() {
  return (_table: unknown) => ({
    values(value: Record<string, unknown>) {
      // app_manifests rows always carry configSchema; app_registry rows never do.
      if ('configSchema' in value) {
        manifestInsertedValues.push(value)
        return { returning: async () => [{ appId: value.appId }] }
      }
      insertedValues.push(value)
      currentApp = { id: 'app-1', ...value }
      return { returning: async () => [{ id: 'app-1' }] }
    },
  })
}

const db = {
  insert: makeInsert(),
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
  transaction: async <T>(fn: (tx: { insert: ReturnType<typeof makeInsert> }) => Promise<T>): Promise<T> => {
    return fn({ insert: makeInsert() })
  },
}

mock.module('~/db', () => ({ db }))
mock.module('~/db/schema', () => fullSchemaBarrelMock())
mock.module('drizzle-orm', () => fullDrizzleOrmMock())

const {
  AppIntegrationValidationError,
  AppManifestValidationError,
  registerApp,
  updateApp,
  resolveAppIntegrationMetadata,
  validateAppIntegrationMetadata,
} = await import('../apps')

describe('app integration metadata validation', () => {
  beforeEach(() => {
    insertedValues.length = 0
    updatedValues.length = 0
    manifestInsertedValues.length = 0
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
      // Defaults are sourced from PLATFORM_AUTH_CONTRACT_VERSION,
      // bumped to 2 in shared v1.2.0 (Rev 2 §02 widened response shape).
      contractVersion: 2,
    })
  })

  test('reports compliance and transport mismatches', () => {
    const errors = validateAppIntegrationMetadata({
      adapterType: 'server_middleware',
      transportMode: 'portable_token',
      handoffMode: 'none',
      brokerOrigin: null,
      brokerSigningSecret: null,
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

// ---------------------------------------------------------------------------
// Spec 03d D12 — register-app-with-manifest
// Admin App Registry can persist app_registry + app_manifests in one txn.
// ---------------------------------------------------------------------------

const baseAppPayload = {
  slug: 'orbit',
  name: 'Orbit',
  url: 'https://orbit.ahacommerce.net',
  basePath: '/',
  adapterType: 'server_middleware' as const,
  transportMode: 'portable_token' as const,
  handoffMode: 'one_time_code' as const,
  brokerOrigin: 'https://coms.ahacommerce.net',
  contractVersion: 1,
  complianceStatus: 'draft' as const,
  manifestPath: null,
  lastVerifiedAt: null,
  status: 'active' as const,
}

describe('registerApp — Spec 03d D12 admin manifest payload', () => {
  beforeEach(() => {
    insertedValues.length = 0
    manifestInsertedValues.length = 0
    currentApp = null
  })

  test('writes only app_registry when manifest is omitted', async () => {
    const result = await registerApp(baseAppPayload)
    expect(result.id).toBe('app-1')
    expect(insertedValues).toHaveLength(1)
    expect(manifestInsertedValues).toHaveLength(0)
  })

  test('writes only app_registry when manifest.configSchema is empty', async () => {
    await registerApp({
      ...baseAppPayload,
      manifest: { configSchema: {}, taxonomies: ['branches'], schemaVersion: 2 },
    })
    expect(insertedValues).toHaveLength(1)
    expect(manifestInsertedValues).toHaveLength(0)
  })

  test('writes app_manifests row when configSchema is non-empty', async () => {
    await registerApp({
      ...baseAppPayload,
      manifest: {
        configSchema: {
          leaderboard_eligible: { type: 'boolean', default: true },
          starting_points: { type: 'integer', default: 0 },
        },
        schemaVersion: 2,
        taxonomies: ['branches', 'teams'],
      },
    })
    expect(insertedValues).toHaveLength(1)
    expect(manifestInsertedValues).toHaveLength(1)
    expect(manifestInsertedValues[0]).toMatchObject({
      appId: 'app-1',
      displayName: 'Orbit',
      schemaVersion: 2,
      taxonomies: ['branches', 'teams'],
    })
    expect(manifestInsertedValues[0]?.configSchema).toMatchObject({
      leaderboard_eligible: { type: 'boolean', default: true },
    })
  })

  test('defaults schemaVersion to 2 and taxonomies to [] when omitted (PR 07-5)', async () => {
    await registerApp({
      ...baseAppPayload,
      manifest: {
        configSchema: { tier: { type: 'string', default: 'basic' } },
      },
    })
    expect(manifestInsertedValues[0]).toMatchObject({
      schemaVersion: 2,
      taxonomies: [],
    })
  })

  test('rejects manifest with schemaVersion below 2 (PR 07-5)', async () => {
    await expect(
      registerApp({
        ...baseAppPayload,
        manifest: {
          configSchema: { tier: { type: 'string', default: 'basic' } },
          schemaVersion: 1,
        },
      }),
    ).rejects.toBeInstanceOf(AppManifestValidationError)
    expect(insertedValues).toHaveLength(0)
    expect(manifestInsertedValues).toHaveLength(0)
  })

  test('rejects invalid configSchema with AppManifestValidationError (no rows written)', async () => {
    await expect(
      registerApp({
        ...baseAppPayload,
        manifest: {
          configSchema: { mystery: { type: 'json', default: {} } } as unknown as Record<
            string,
            never
          >,
        },
      }),
    ).rejects.toBeInstanceOf(AppManifestValidationError)
    expect(insertedValues).toHaveLength(0)
    expect(manifestInsertedValues).toHaveLength(0)
  })
})
