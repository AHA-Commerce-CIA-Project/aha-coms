import { eq } from 'drizzle-orm'
import { db } from '@coms/shared/db'
import { heroesProfiles } from '@coms/shared/db/schema'
import { destroySessionsForPortalSub } from '@coms/shared/auth/session'
import type { PortalEventHandler } from './dispatch'

interface UserOffboardedPayload {
  user?: { portalSub: string }
  userId?: string
  portalSub?: string
  deactivatedAt?: string
  offboardedAt?: string
}

export const handleUserOffboarded: PortalEventHandler = async (body) => {
  const payload = body as UserOffboardedPayload
  const portalSub = payload.user?.portalSub ?? payload.userId ?? payload.portalSub
  if (!portalSub) {
    console.warn('[handle-user-offboarded] payload missing portalSub, skipping')
    return
  }

  const archivedIso = payload.deactivatedAt ?? payload.offboardedAt
  const archivedAt = archivedIso ? new Date(archivedIso) : new Date()

  await db
    .update(heroesProfiles)
    .set({ isActive: false, archivedAt, updatedAt: new Date() })
    .where(eq(heroesProfiles.id, portalSub))

  const revoked = await destroySessionsForPortalSub(portalSub)
  if (revoked > 0) {
    console.log(`[handle-user-offboarded] revoked ${revoked} session(s) for portalSub=${portalSub}`)
  }
}
