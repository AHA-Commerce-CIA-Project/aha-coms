/**
 * Backward-compatibility lock for v1.5.0 consumers.
 *
 * Heroes pins @coms-portal/shared v1.5.0 today and v1.6.0 only after
 * Spec 08 Deploy A. Until then, every type, constant, and field name shipped
 * in v1.5.0 must continue to type-check and behave the same way against the
 * v1.6.0 surface. This file exercises the v1.5.0 shapes verbatim — if a
 * future change renames a field or tightens a type, this test goes red and
 * the v1.6.0 PR is blocked from publishing.
 */

import { describe, expect, test } from 'bun:test'
import {
  PORTAL_WEBHOOK_EVENTS,
  PORTAL_WEBHOOK_CONTRACT_VERSION,
  PORTAL_WEBHOOK_SIGNATURE_HEADER,
  PORTAL_WEBHOOK_EVENT_HEADER,
  PORTAL_WEBHOOK_EVENT_ID_HEADER,
  PORTAL_WEBHOOK_TIMESTAMP_HEADER,
  USER_EMAIL_KINDS,
  USER_EMAIL_ADDED_BY,
  type PortalWebhookEnvelope,
  type SessionRevokedPayload,
  type UserProvisionedPayload,
  type UserUpdatedPayload,
  type UserOffboardedPayload,
  type AliasResolvedPayload,
  type AliasUpdatedPayload,
  type AliasDeletedPayload,
  type AppConfigUpdatedPayload,
  type UserEmailEntry,
  type UserEmailKind,
  type UserEmailAddedBy,
} from '../contracts/webhook-events'

describe('v1.5.0 PORTAL_WEBHOOK_EVENTS — names preserved', () => {
  test('every v1.5.0 event name is still present', () => {
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
      expect(PORTAL_WEBHOOK_EVENTS).toContain(name)
    }
  })
})

describe('v1.5.0 header + version constants', () => {
  test('contract version is still 1', () => {
    expect(PORTAL_WEBHOOK_CONTRACT_VERSION).toBe(1)
  })

  test('signature/event/event-id/timestamp header names are unchanged', () => {
    expect(PORTAL_WEBHOOK_SIGNATURE_HEADER).toBe('X-Portal-Signature')
    expect(PORTAL_WEBHOOK_EVENT_HEADER).toBe('X-Portal-Event')
    expect(PORTAL_WEBHOOK_EVENT_ID_HEADER).toBe('X-Portal-Event-Id')
    expect(PORTAL_WEBHOOK_TIMESTAMP_HEADER).toBe('X-Portal-Timestamp')
  })
})

describe('v1.5.0 email constants', () => {
  test('USER_EMAIL_KINDS unchanged', () => {
    expect(USER_EMAIL_KINDS).toEqual(['workspace', 'personal'])
  })

  test('USER_EMAIL_ADDED_BY unchanged', () => {
    expect(USER_EMAIL_ADDED_BY).toEqual([
      'admin',
      'self',
      'csv_import',
      'sheet_sync',
      'backfill',
      'bootstrap',
    ])
  })
})

describe('v1.5.0 payload shapes — verbatim consumption', () => {
  test('SessionRevokedPayload still accepts the v1.5.0 shape', () => {
    const p: SessionRevokedPayload = {
      userId: 'u',
      gipUid: 'g',
      email: 'a@b.c',
      reason: 'logout',
      notBefore: '2026-05-04T00:00:00Z',
    }
    expect(p.reason).toBe('logout')
  })

  test('UserProvisionedPayload still accepts the v1.5.0 shape (no envelope fields)', () => {
    const kind: UserEmailKind = 'workspace'
    const addedBy: UserEmailAddedBy = 'admin'
    const entry: UserEmailEntry = {
      address: 'a@b.c',
      kind,
      isPrimary: true,
      verified: true,
      addedBy,
    }
    const p: UserProvisionedPayload = {
      userId: 'u',
      gipUid: 'g',
      email: 'a@b.c',
      name: 'Jane',
      portalRole: 'admin',
      teamIds: ['t1'],
      apps: ['heroes'],
      appRole: 'leader',
      branch: 'Indonesia',
      appConfig: { config: {}, schemaVersion: 1 },
      emails: [entry],
    }
    expect(p.appRole).toBe('leader')
  })

  test('UserUpdatedPayload still accepts the v1.5.0 shape', () => {
    const p: UserUpdatedPayload = {
      userId: 'u',
      gipUid: null,
      email: 'a@b.c',
      name: 'Jane',
      portalRole: 'admin',
      teamIds: [],
      apps: [],
      changedFields: ['email'],
      appRole: null,
      branch: null,
      emails: [],
    }
    expect(p.changedFields).toEqual(['email'])
  })

  test('UserOffboardedPayload unchanged', () => {
    const p: UserOffboardedPayload = {
      userId: 'u',
      gipUid: null,
      email: 'a@b.c',
      offboardedAt: '2026-05-04T00:00:00Z',
    }
    expect(p.userId).toBe('u')
  })

  test('AliasResolvedPayload / AliasUpdatedPayload / AliasDeletedPayload unchanged', () => {
    const r: AliasResolvedPayload = {
      aliasId: 'a',
      aliasNormalized: 'jane smith',
      portalSub: 'u',
      isPrimary: true,
    }
    const u: AliasUpdatedPayload = {
      aliasId: 'a',
      aliasNormalized: 'jane smith',
      portalSub: 'u',
      isPrimary: false,
      previousIsPrimary: true,
    }
    const d: AliasDeletedPayload = {
      aliasId: 'a',
      aliasNormalized: 'jane smith',
      portalSub: 'u',
    }
    expect([r.isPrimary, u.previousIsPrimary, d.aliasId]).toEqual([true, true, 'a'])
  })

  test('AppConfigUpdatedPayload unchanged', () => {
    const p: AppConfigUpdatedPayload = {
      portalSub: 'u',
      config: {},
      previousConfig: {},
      schemaVersion: 1,
      batchId: null,
    }
    expect(p.schemaVersion).toBe(1)
  })

  test('PortalWebhookEnvelope generic still wraps a v1.5.0 payload', () => {
    const env: PortalWebhookEnvelope<SessionRevokedPayload> = {
      contractVersion: 1,
      event: 'session.revoked',
      eventId: 'evt',
      occurredAt: '2026-05-04T00:00:00Z',
      appSlug: 'heroes',
      payload: {
        userId: 'u',
        gipUid: 'g',
        email: 'a@b.c',
        reason: 'logout',
        notBefore: '2026-05-04T00:00:00Z',
      },
    }
    expect(env.contractVersion).toBe(1)
  })
})
