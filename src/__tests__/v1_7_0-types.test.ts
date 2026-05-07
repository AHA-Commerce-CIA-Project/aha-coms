/**
 * v1.7.0 contract tests — Spec 06 (Rev 4) onboarding smoketest event.
 *
 * Adds `'app.smoketest'` to `PORTAL_WEBHOOK_EVENTS`. The portal dispatches
 * this event synchronously to every active webhook endpoint as part of the
 * `coms-portal-cli smoketest <slug>` flow; receivers are expected to
 * recognise the name and ack 2xx without business-side processing.
 *
 * Run with `bun test`.
 */

import { describe, expect, test } from 'bun:test'
import { PORTAL_WEBHOOK_EVENTS, type PortalWebhookEvent } from '../contracts/webhook-events'

describe('PORTAL_WEBHOOK_EVENTS — Spec 06 PR (Rev 4) addition', () => {
  test('contains app.smoketest', () => {
    expect(PORTAL_WEBHOOK_EVENTS).toContain('app.smoketest' as PortalWebhookEvent)
  })

  test('app.smoketest type-narrows to PortalWebhookEvent without cast', () => {
    // If the literal is in the const tuple, this assignment compiles. If the
    // tuple is missing the literal, tsc will reject the rhs at compile time.
    const e: PortalWebhookEvent = 'app.smoketest'
    expect(e).toBe('app.smoketest')
  })

  test('preserves every prior v1.6.0 event name (additive minor)', () => {
    for (const name of [
      'session.revoked',
      'user.provisioned',
      'user.updated',
      'user.offboarded',
      'alias.resolved',
      'alias.updated',
      'alias.deleted',
      'app_config.updated',
      'taxonomy.upserted',
      'taxonomy.deleted',
      'employment.updated',
    ] as const) {
      expect(PORTAL_WEBHOOK_EVENTS).toContain(name as PortalWebhookEvent)
    }
  })
})
