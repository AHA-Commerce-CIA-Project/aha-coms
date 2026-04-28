import { eq } from 'drizzle-orm'
import { db } from '~/db'
import { appRegistry } from '~/db/schema/apps'
import { dispatchPortalWebhook } from './portal-webhook-fanout'
import type { AppConfigUpdatedPayload } from '@coms-portal/shared'

export interface EmitAppConfigUpdatedParams {
  portalSub: string
  /** UUID from app_user_config.appId / app_manifests.appId */
  appId: string
  config: Record<string, unknown>
  previousConfig: Record<string, unknown>
  schemaVersion: number
  batchId: string | null
}

/**
 * Emit app_config.updated after an app_user_config row has been written.
 * Fans out only to the affected app's subscribed endpoints via appSlugs filter.
 * batchId is shared across all rows in a bulk edit; null for single-row edits.
 */
export async function emitAppConfigUpdated(params: EmitAppConfigUpdatedParams): Promise<void> {
  const [appRow] = await db
    .select({ slug: appRegistry.slug })
    .from(appRegistry)
    .where(eq(appRegistry.id, params.appId))
    .limit(1)

  if (!appRow) {
    console.warn(`[app-user-config-events] app not found for appId ${params.appId} — skipping emit`)
    return
  }

  const payload: AppConfigUpdatedPayload = {
    portalSub: params.portalSub,
    config: params.config,
    previousConfig: params.previousConfig,
    schemaVersion: params.schemaVersion,
    batchId: params.batchId,
  }

  await dispatchPortalWebhook('app_config.updated', payload, {
    appSlugs: [appRow.slug],
  })
}
