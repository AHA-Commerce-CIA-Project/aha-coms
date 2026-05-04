import { eq } from 'drizzle-orm'
import { db } from '@coms/shared/db'
import { heroesProfiles } from '@coms/shared/db/schema'
import type { PortalEventHandler } from './dispatch'

interface UserOffboardedPayload {
  user?: { portalSub: string }
  portalSub?: string
  deactivatedAt?: string
}

export const handleUserOffboarded: PortalEventHandler = async (body) => {
  const payload = body as UserOffboardedPayload
  const portalSub = payload.user?.portalSub ?? payload.portalSub
  if (!portalSub) {
    console.warn('[handle-user-offboarded] payload missing portalSub, skipping')
    return
  }

  const archivedAt = payload.deactivatedAt ? new Date(payload.deactivatedAt) : new Date()

  await db
    .update(heroesProfiles)
    .set({ isActive: false, archivedAt, updatedAt: new Date() })
    .where(eq(heroesProfiles.id, portalSub))
}
