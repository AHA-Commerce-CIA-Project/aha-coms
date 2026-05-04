import type { SessionRevokedPayload } from '@coms-portal/shared'
import { destroySessionsForPortalSub } from '@coms/shared/auth/session'
import type { PortalEventHandler } from './dispatch'

export const handleSessionRevoked: PortalEventHandler = async (body) => {
  const payload = body as SessionRevokedPayload
  const portalSub = payload.userId
  if (!portalSub) {
    console.warn('[handle-session-revoked] payload missing userId, skipping')
    return
  }

  const count = await destroySessionsForPortalSub(portalSub)
  console.log(
    `[handle-session-revoked] revoked ${count} session(s) for portalSub=${portalSub} reason=${payload.reason ?? 'unspecified'}`,
  )
}
