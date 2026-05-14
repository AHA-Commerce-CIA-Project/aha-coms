import type { UserOffboardedPayload } from '@coms-portal/sdk'
import { prisma } from '@/lib/db'
import type { PortalEventHandler } from '../dispatch'

/**
 * `user.offboarded` — portal has revoked fast access for this user.
 * Defensive coverage already exists via `loadFastAuthUser` (which
 * throws PortalSessionDeniedError when 'fast' is missing from
 * `apps`), but the webhook gives fast a proactive signal so the
 * user's accountStatus reflects reality before their next sign-in.
 *
 * The portal owns session destruction directly via auth_sessions;
 * this handler does not touch sessions (fast has none of its own
 * since T64). Setting accountStatus='rejected' lines up with fast's
 * existing column convention — 'pending_activation' /
 * 'pending_setup' / 'pending_approval' / 'active' / 'rejected'.
 * 'rejected' is the closest fit for "no longer authorised"; a
 * future migration could add 'offboarded' as a distinct value but
 * isn't worth the column-state widening here.
 */
export const handleUserOffboarded: PortalEventHandler = async (body) => {
  const payload = body as UserOffboardedPayload
  const portalSub = payload.userId
  if (!portalSub) {
    console.warn('[handle-user-offboarded] payload missing userId, skipping')
    return
  }

  await prisma.user.updateMany({
    where: { portal_sub: portalSub },
    data: {
      accountStatus: 'rejected',
      updatedAt: new Date(),
    },
  })
}
