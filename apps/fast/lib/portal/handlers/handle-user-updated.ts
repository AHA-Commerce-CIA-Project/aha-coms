import type { UserUpdatedPayload } from '@coms-portal/sdk'
import { prisma } from '@/lib/db'
import type { PortalEventHandler } from '../dispatch'
import { mapPortalRoleToFastRole } from '../role-mapping'

/**
 * `user.updated` — portal-side delta on an existing user. The
 * `changedFields` array lists which fields actually changed; the
 * handler reads only the keys named there and falls back to the
 * top-level scalars for the field's new value. Skipping unchanged
 * fields keeps the write tight and avoids clobbering fast-side state
 * (like User.lastSeenAt or User.accountStatus) that the webhook has
 * no business touching.
 *
 * `role` rides through `appRole` (the portal dual-emits the resolved
 * app-local role at the top level until PR 07-5; afterwards it lives
 * inside `appConfig.config.role`). The role update fires whenever
 * the top-level appRole is present, defensive of changedFields
 * differing across portal revisions.
 */
export const handleUserUpdated: PortalEventHandler = async (body) => {
  const payload = body as UserUpdatedPayload
  const portalSub = payload.userId
  if (!portalSub) {
    console.warn('[handle-user-updated] payload missing userId, skipping')
    return
  }

  const changedFields = new Set(payload.changedFields ?? [])
  const update: { name?: string; email?: string; role?: string; updatedAt: Date } = {
    updatedAt: new Date(),
  }

  if (changedFields.has('name') && payload.name) update.name = payload.name
  if (changedFields.has('email') && payload.email) update.email = payload.email

  if (payload.appRole !== undefined && payload.appRole !== null) {
    const mapped = mapPortalRoleToFastRole(payload.appRole)
    if (mapped) update.role = mapped
  }

  if (Object.keys(update).length === 1) return

  await prisma.user.update({
    where: { portal_sub: portalSub },
    data: update,
  })
}
