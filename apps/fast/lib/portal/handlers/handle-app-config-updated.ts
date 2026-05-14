import type { AppConfigEvent } from '@coms-portal/sdk'
import { prisma } from '@/lib/db'
import type { PortalEventHandler } from '../dispatch'
import { mapPortalRoleToFastRole } from '../role-mapping'

/**
 * `app_config.updated` — per-recipient app-config slice changed.
 * Fast's manifest declares `role` (enum) and `teamId` (string). The
 * `role` field carries directly to User.role through the mapping;
 * `teamId` is deliberately skipped here because fast's local Team
 * table uses local UUIDs that do not yet reconcile with portal's
 * 'teams' taxonomy keys — wiring that mapping deserves its own
 * task once the operator decides the reconciliation shape (replace
 * fast's UUIDs with portal keys, or maintain a side-table lookup).
 */
export const handleAppConfigUpdated: PortalEventHandler = async (body) => {
  const payload = body as AppConfigEvent
  if (!payload.portalSub) {
    console.warn('[handle-app-config-updated] payload missing portalSub, skipping')
    return
  }

  const mappedRole = mapPortalRoleToFastRole((payload.config as { role?: unknown }).role)
  if (!mappedRole) return

  await prisma.user.updateMany({
    where: { portal_sub: payload.portalSub },
    data: {
      role: mappedRole,
      updatedAt: new Date(),
    },
  })
}
