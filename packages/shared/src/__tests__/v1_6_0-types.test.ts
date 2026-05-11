/**
 * v1.6.0 contract tests — Spec 07 org-taxonomies + employment block.
 *
 * Type-level + runtime checks proving the new shapes defined by
 * `docs/architecture/rev3/spec-07-org-taxonomies-and-employment-block.md`
 * (in the coms_portal repo) are present and structurally correct.
 *
 * Run with `bun test`.
 */

import { describe, expect, test } from 'bun:test'
import {
  PORTAL_WEBHOOK_EVENTS,
  type PortalWebhookEvent,
  type EmploymentBlock,
  type TaxonomyRef,
  type TaxonomyUpsertedPayload,
  type TaxonomyDeletedPayload,
  type TaxonomyEvent,
  type EmploymentUpdatedPayload,
  type AppConfigEvent,
  type ContactEmail,
  type WebhookUserEnvelope,
} from '../contracts/webhook-events'
import type { PortalIntegrationManifest } from '../contracts/integration-manifest'

describe('PORTAL_WEBHOOK_EVENTS — Spec 07 additions', () => {
  test('contains taxonomy.upserted', () => {
    expect(PORTAL_WEBHOOK_EVENTS).toContain('taxonomy.upserted' as PortalWebhookEvent)
  })

  test('contains taxonomy.deleted', () => {
    expect(PORTAL_WEBHOOK_EVENTS).toContain('taxonomy.deleted' as PortalWebhookEvent)
  })

  test('contains employment.updated', () => {
    expect(PORTAL_WEBHOOK_EVENTS).toContain('employment.updated' as PortalWebhookEvent)
  })

  test('preserves Spec 06 / Spec 03 event names', () => {
    for (const name of [
      'session.revoked',
      'user.provisioned',
      'user.updated',
      'user.offboarded',
      'alias.resolved',
      'alias.updated',
      'alias.deleted',
      'app_config.updated',
    ] as const) {
      expect(PORTAL_WEBHOOK_EVENTS).toContain(name as PortalWebhookEvent)
    }
  })
})

describe('EmploymentBlock — structural shape', () => {
  test('accepts a fully-populated block from getEmploymentBlock(userId)', () => {
    const ref: TaxonomyRef = { taxonomyId: 'branches', key: 'ID', value: 'Indonesia' }
    const block: EmploymentBlock = {
      branch: ref,
      team: { taxonomyId: 'teams', key: 'eng', value: 'Engineering' },
      department: { taxonomyId: 'departments', key: 'platform', value: 'Platform' },
      position: 'Senior Engineer',
      phone: '+62-...',
      employmentStatus: 'full_time',
      talentaId: 'TLT-001',
      attendanceName: 'Jane S.',
      leaderName: 'Alex P.',
      birthDate: '1990-01-01',
    }
    expect(block.branch).toEqual(ref)
  })

  test('accepts nulls for unset fields (the seed-period default)', () => {
    const block: EmploymentBlock = {
      branch: null,
      team: null,
      department: null,
      position: null,
      phone: null,
      employmentStatus: null,
      talentaId: null,
      attendanceName: null,
      leaderName: null,
      birthDate: null,
    }
    expect(block.team).toBeNull()
  })
})

describe('TaxonomyEvent — discriminated union', () => {
  test('upserted variant carries entries[]', () => {
    const ev: TaxonomyEvent = {
      kind: 'upserted',
      taxonomyId: 'branches',
      entries: [
        { key: 'ID', value: 'Indonesia', metadata: null },
        { key: 'TH', value: 'Thailand', metadata: { code: 'TH' } },
      ],
    }
    if (ev.kind === 'upserted') {
      expect(ev.entries).toHaveLength(2)
    }
  })

  test('deleted variant carries keys[]', () => {
    const ev: TaxonomyEvent = {
      kind: 'deleted',
      taxonomyId: 'branches',
      keys: ['SG'],
    }
    if (ev.kind === 'deleted') {
      expect(ev.keys).toEqual(['SG'])
    }
  })

  test('plain payload types match emitTaxonomy* helpers in coms_portal', () => {
    const upserted: TaxonomyUpsertedPayload = {
      taxonomyId: 'branches',
      entries: [{ key: 'ID', value: 'Indonesia', metadata: null }],
    }
    const deleted: TaxonomyDeletedPayload = {
      taxonomyId: 'departments',
      keys: ['old'],
    }
    expect(upserted.entries[0]?.key).toBe('ID')
    expect(deleted.keys[0]).toBe('old')
  })
})

describe('EmploymentUpdatedPayload — shape match with portal emitter', () => {
  test('carries user.portalSub + employment + previousEmployment', () => {
    const payload: EmploymentUpdatedPayload = {
      user: { portalSub: 'uuid-1' },
      employment: { branch: null, position: 'Lead Engineer' },
      previousEmployment: { branch: null, position: 'Senior Engineer' },
    }
    expect(payload.user.portalSub).toBe('uuid-1')
  })
})

describe('AppConfigEvent — Spec 03 finalised', () => {
  test('matches the AppConfigUpdatedPayload shape', () => {
    const event: AppConfigEvent = {
      portalSub: 'uuid-1',
      config: { theme: 'dark' },
      previousConfig: { theme: 'light' },
      schemaVersion: 1,
      batchId: null,
    }
    expect(event.schemaVersion).toBe(1)
  })
})

describe('ContactEmail — typedef', () => {
  test('accepts a plain string per Spec 07 §Email handling', () => {
    const email: ContactEmail = 'jane@example.com'
    expect(email).toBe('jane@example.com')
  })
})

describe('WebhookUserEnvelope — Spec 07 unified envelope', () => {
  test('contains user{portalSub,name,primaryAliasId} + contactEmail + employment + appConfig', () => {
    const envelope: WebhookUserEnvelope = {
      user: { portalSub: 'uuid-1', name: 'Jane Smith', primaryAliasId: null },
      contactEmail: 'jane@example.com',
      employment: {
        branch: null,
        team: null,
        department: null,
        position: null,
        phone: null,
        employmentStatus: null,
        talentaId: null,
        attendanceName: null,
        leaderName: null,
        birthDate: null,
      },
      appConfig: { config: {}, schemaVersion: 1 },
    }
    expect(envelope.user.primaryAliasId).toBeNull()
  })

  test('appConfig may be null (apps with no per-user config slice)', () => {
    const envelope: WebhookUserEnvelope = {
      user: { portalSub: 'uuid-1', name: 'Jane', primaryAliasId: null },
      contactEmail: 'jane@example.com',
      employment: null,
      appConfig: null,
    }
    expect(envelope.appConfig).toBeNull()
  })
})

describe('PortalIntegrationManifest — taxonomies extension', () => {
  test('accepts taxonomies: string[]', () => {
    const manifest: Pick<PortalIntegrationManifest, 'taxonomies'> = {
      taxonomies: ['branches', 'teams', 'departments'],
    }
    expect(manifest.taxonomies).toContain('branches')
  })

  test('taxonomies is optional (existing manifests still type-check)', () => {
    const manifest: Pick<PortalIntegrationManifest, 'taxonomies'> = {}
    expect(manifest.taxonomies).toBeUndefined()
  })
})
