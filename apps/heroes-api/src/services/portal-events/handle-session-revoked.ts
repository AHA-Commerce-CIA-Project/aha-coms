import type { SessionRevokedPayload } from '@coms-portal/sdk'
import type { PortalEventHandler } from './dispatch'

/**
 * Phase 2 (Spec 02) retired heroes' local session table — every request now
 * introspects portal's `__session` through `/api/userinfo` directly, so a
 * portal-side revocation takes effect on the next call without heroes having
 * to act on the webhook. The handler stays in the dispatch table so the
 * portal_webhook_events row records the event (audit + idempotency) but the
 * body is just a structured log line.
 */
export const handleSessionRevoked: PortalEventHandler = async (body) => {
  const payload = body as SessionRevokedPayload
  const portalSub = payload.userId
  if (!portalSub) {
    console.warn('[handle-session-revoked] payload missing userId, skipping')
    return
  }
  console.log(
    `[handle-session-revoked] noted revocation for portalSub=${portalSub} reason=${payload.reason ?? 'unspecified'} — no local action needed under Phase 2`,
  )
}
