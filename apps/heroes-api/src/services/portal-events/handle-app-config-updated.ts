import { eq } from 'drizzle-orm'
import type { AppConfigEvent } from '@coms-portal/sdk'
import { db } from '@coms-portal/heroes-shared/db'
import { heroesProfiles, userConfigCache } from '@coms-portal/heroes-shared/db/schema'
import type { PortalEventHandler } from './dispatch'

export const handleAppConfigUpdated: PortalEventHandler = async (body) => {
  const payload = body as AppConfigEvent
  if (!payload.portalSub) {
    console.warn('[handle-app-config-updated] payload missing portalSub, skipping')
    return
  }

  await db
    .insert(userConfigCache)
    .values({
      portalSub: payload.portalSub,
      config: payload.config,
      schemaVersion: payload.schemaVersion,
    })
    .onConflictDoUpdate({
      target: userConfigCache.portalSub,
      set: {
        config: payload.config,
        schemaVersion: payload.schemaVersion,
        cachedAt: new Date(),
      },
    })

  await db
    .update(heroesProfiles)
    .set({
      canSubmitPoints: payload.config.canSubmitPoints === true,
      updatedAt: new Date(),
    })
    .where(eq(heroesProfiles.id, payload.portalSub))
}
