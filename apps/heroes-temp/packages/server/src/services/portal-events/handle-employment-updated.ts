import { eq } from 'drizzle-orm'
import type { EmploymentUpdatedPayload } from '@coms-portal/sdk'
import { db } from '@coms/shared/db'
import { heroesProfiles } from '@coms/shared/db/schema'
import type { PortalEventHandler } from './dispatch'
import { employmentUpdatedToDenormFields } from './payload-projection'

export const handleEmploymentUpdated: PortalEventHandler = async (body) => {
  const payload = body as EmploymentUpdatedPayload
  const portalSub = payload.user?.portalSub
  if (!portalSub) {
    console.warn('[handle-employment-updated] payload missing user.portalSub, skipping')
    return
  }

  const update = employmentUpdatedToDenormFields(payload)
  if (Object.keys(update).length === 0) {
    return
  }

  await db
    .update(heroesProfiles)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(heroesProfiles.id, portalSub))
}
