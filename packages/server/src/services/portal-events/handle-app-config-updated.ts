import type { AppConfigEvent } from '@coms-portal/shared'
import { db } from '@coms/shared/db'
import { userConfigCache } from '@coms/shared/db/schema'
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
}
