import { handleAliasUpdated } from './handlers/handle-alias-updated'
import { handleAppConfigUpdated } from './handlers/handle-app-config-updated'
import { handleEmploymentUpdated } from './handlers/handle-employment-updated'
import { handleTaxonomyDeleted } from './handlers/handle-taxonomy-deleted'
import { handleTaxonomyUpserted } from './handlers/handle-taxonomy-upserted'
import { handleUserOffboarded } from './handlers/handle-user-offboarded'
import { handleUserProvisioned } from './handlers/handle-user-provisioned'
import { handleUserUpdated } from './handlers/handle-user-updated'

export type PortalEventHandler = (body: unknown) => Promise<void>

export type PortalEventHandlerMap = Partial<Record<string, PortalEventHandler>>

export interface DispatchOptions {
  handlers?: PortalEventHandlerMap
}

/**
 * The eight events fast subscribes to per
 * apps/portal-api/scripts/spec07-register-fast.ts. The dispatch map
 * is the structural inventory — adding or removing an event here
 * means the matching registration in `app_webhook_endpoints` should
 * change in lockstep.
 */
export const portalEventHandlers: PortalEventHandlerMap = {
  'alias.updated': handleAliasUpdated,
  'app_config.updated': handleAppConfigUpdated,
  'employment.updated': handleEmploymentUpdated,
  'taxonomy.deleted': handleTaxonomyDeleted,
  'taxonomy.upserted': handleTaxonomyUpserted,
  'user.offboarded': handleUserOffboarded,
  'user.provisioned': handleUserProvisioned,
  'user.updated': handleUserUpdated,
}

export async function dispatchPortalEvent(
  event: string,
  body: unknown,
  options: DispatchOptions = {},
): Promise<void> {
  const handlers = options.handlers ?? portalEventHandlers
  const handler = handlers[event]
  if (!handler) return
  await handler(body)
}
