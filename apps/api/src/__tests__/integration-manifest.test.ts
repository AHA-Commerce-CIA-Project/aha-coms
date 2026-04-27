import { describe, expect, test } from 'bun:test'
import {
  PORTAL_INTEGRATION_MANIFEST_FILE,
  createPortalIntegrationManifest,
  validatePortalIntegrationManifest,
} from '@coms-portal/shared'

describe('integration manifest contract', () => {
  test('creates a draft manifest with contract defaults', () => {
    const manifest = createPortalIntegrationManifest({
      appSlug: 'heroes',
      appName: 'Heroes',
      runtime: {
        stack: 'bun',
        framework: 'elysia',
        language: 'typescript',
      },
      adapter: {
        type: 'server_middleware',
        transport: 'portable_token',
        handoffMode: 'one_time_code',
        protectedRouteMode: 'app_wide',
        audience: 'heroes.internal',
        brokerOrigin: 'https://coms.ahacommerce.net',
      },
      authEntrypoints: [{ kind: 'token_exchange', path: '/api/auth/exchange', method: 'POST' }],
      protectedRoutes: [{ pattern: '/app', kind: 'prefix' }],
      requiredEnv: [{ name: 'PORTAL_TOKEN_AUDIENCE', required: true }],
    })

    expect(PORTAL_INTEGRATION_MANIFEST_FILE).toBe('portal.integration.json')
    expect(manifest.manifestVersion).toBe(1)
    expect(manifest.compliance.status).toBe('draft')
    // contractVersion default is sourced from PLATFORM_AUTH_CONTRACT_VERSION,
    // bumped to 2 in shared v1.2.0 (Rev 2 §02 widened response shape).
    expect(manifest.compliance.contractVersion).toBe(2)
    expect(validatePortalIntegrationManifest(manifest)).toEqual([])
  })

  test('rejects manifests that are missing transport-specific requirements', () => {
    const manifest = createPortalIntegrationManifest({
      appSlug: 'legacy',
      appName: 'Legacy',
      runtime: {
        stack: 'node',
      },
      adapter: {
        type: 'server_middleware',
        transport: 'same_host_cookie',
        handoffMode: 'none',
        protectedRouteMode: 'allowlist',
      },
      authEntrypoints: [{ kind: 'session_probe', path: '/auth/me' }],
      protectedRoutes: [{ pattern: '/admin', kind: 'prefix' }],
      requiredEnv: [],
    })

    expect(validatePortalIntegrationManifest(manifest)).toContain(
      'adapter.sessionCookieName is required for same_host_cookie transport',
    )
  })

  test('rejects portable-token manifests without brokered handoff requirements', () => {
    const manifest = createPortalIntegrationManifest({
      appSlug: 'orbit',
      appName: 'Orbit',
      runtime: {
        stack: 'node',
      },
      adapter: {
        type: 'server_middleware',
        transport: 'portable_token',
        handoffMode: 'none',
        protectedRouteMode: 'app_wide',
      },
      authEntrypoints: [{ kind: 'token_exchange', path: '/auth/exchange', method: 'POST' }],
      protectedRoutes: [{ pattern: '/', kind: 'prefix' }],
      requiredEnv: [],
    })

    expect(validatePortalIntegrationManifest(manifest)).toEqual([
      'adapter.audience is required for portable_token transport',
      'adapter.brokerOrigin is required for portable_token transport',
      'adapter.handoffMode must not be none for portable_token transport',
    ])
  })
})
