import { eq } from 'drizzle-orm'
import type { AppConfigEvent } from '@coms-portal/sdk'
import { db } from '@coms-portal/heroes-shared/db'
import { heroesProfiles } from '@coms-portal/heroes-shared/db/schema'
import type { PortalEventHandler } from './dispatch'

export const handleAppConfigUpdated: PortalEventHandler = async (body) => {
  const payload = body as AppConfigEvent
  if (!payload.portalSub) {
    console.warn('[handle-app-config-updated] payload missing portalSub, skipping')
    return
  }

  await db
    .update(heroesProfiles)
    .set({
      canSubmitPoints: payload.config.canSubmitPoints === true,
      updatedAt: new Date(),
    })
    .where(eq(heroesProfiles.id, payload.portalSub))
}
