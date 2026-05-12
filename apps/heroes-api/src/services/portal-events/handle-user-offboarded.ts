import { eq } from 'drizzle-orm'
import { db } from '@coms-portal/heroes-shared/db'
import { heroesProfiles } from '@coms-portal/heroes-shared/db/schema'
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

  // Phase 2 retired the local heroes session table; session destruction is
  // portal's responsibility now and propagates the next time the user's
  // `__session` cookie fails `/api/userinfo` introspection (401).
}
