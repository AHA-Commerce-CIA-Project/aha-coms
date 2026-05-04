import { eq } from 'drizzle-orm'
import type { UserUpdatedPayload } from '@coms-portal/shared'
import { db } from '@coms/shared/db'
import { emailCache, heroesProfiles } from '@coms/shared/db/schema'
import type { PortalEventHandler } from './dispatch'

interface SpecUserUpdatedPayload {
  user: { portalSub: string; name?: string }
  contactEmail?: string
  changedFields?: string[]
}

export const handleUserUpdated: PortalEventHandler = async (body) => {
  const legacy = body as Partial<UserUpdatedPayload> & SpecUserUpdatedPayload
  const portalSub = legacy.user?.portalSub
  if (!portalSub) {
    console.warn('[handle-user-updated] payload missing user.portalSub, skipping')
    return
  }

  const nameUpdate = legacy.user?.name
  if (nameUpdate) {
    await db
      .update(heroesProfiles)
      .set({ name: nameUpdate, updatedAt: new Date() })
      .where(eq(heroesProfiles.id, portalSub))
  }

  if (legacy.contactEmail) {
    await db
      .insert(emailCache)
      .values({ portalSub, contactEmail: legacy.contactEmail })
      .onConflictDoUpdate({
        target: emailCache.portalSub,
        set: { contactEmail: legacy.contactEmail, cachedAt: new Date() },
      })
  }
}
