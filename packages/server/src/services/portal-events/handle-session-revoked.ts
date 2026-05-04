import type { PortalEventHandler } from './dispatch'

export const handleSessionRevoked: PortalEventHandler = async () => {
  throw new Error('[portal-events] handle-session-revoked not yet implemented (Slice 5 — broker rewrite restores session module)')
}
