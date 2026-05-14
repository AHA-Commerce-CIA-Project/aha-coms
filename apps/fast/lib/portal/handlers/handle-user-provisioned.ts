import type { UserProvisionedPayload } from '@coms-portal/sdk'
import { prisma } from '@/lib/db'
import type { PortalEventHandler } from '../dispatch'
import { mapPortalRoleToFastRole } from '../role-mapping'

/**
 * `user.provisioned` — portal informs fast that a new user has been
 * provisioned with fast access. The same row gets upserted on the
 * user's first authenticated hit via `loadFastAuthUser`, so this
 * handler exists as the *pre-emptive* path: fast learns about the
 * user before they sign in, which lets dashboards / @-mentions /
 * notification routing reference the user without first-visit delay.
 *
 * Conservative on role: only writes `role` when the portal-issued
 * value maps cleanly to fast's existing column convention
 * ('member' | 'leader' | 'admin'). Unknown values land as 'member'
 * via the create default; existing rows keep their current role.
 */
export const handleUserProvisioned: PortalEventHandler = async (body) => {
  const payload = body as UserProvisionedPayload
  const portalSub = payload.userId
  if (!portalSub) {
    console.warn('[handle-user-provisioned] payload missing userId, skipping')
    return
  }

  const mappedRole = mapPortalRoleToFastRole(
    payload.appRole ?? (payload.appConfig?.config as { role?: unknown } | null)?.role,
  )

  const now = new Date()

  await prisma.user.upsert({
    where: { portal_sub: portalSub },
    create: {
      id: portalSub,
      portal_sub: portalSub,
      email: payload.email,
      name: payload.name,
      role: mappedRole ?? 'member',
      createdAt: now,
      updatedAt: now,
    },
    update: {
      email: payload.email,
      name: payload.name,
      ...(mappedRole ? { role: mappedRole } : {}),
      updatedAt: now,
    },
  })
}
