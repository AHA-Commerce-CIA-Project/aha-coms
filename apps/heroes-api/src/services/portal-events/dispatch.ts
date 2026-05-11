import { handleAliasDeleted } from './handle-alias-deleted'
import { handleAliasResolved } from './handle-alias-resolved'
import { handleAliasUpdated } from './handle-alias-updated'
import { handleAppConfigUpdated } from './handle-app-config-updated'
import { handleEmploymentUpdated } from './handle-employment-updated'
import { handleSessionRevoked } from './handle-session-revoked'
import { handleTaxonomyDeleted } from './handle-taxonomy-deleted'
import { handleTaxonomyUpserted } from './handle-taxonomy-upserted'
import { handleUserOffboarded } from './handle-user-offboarded'
import { handleUserProvisioned } from './handle-user-provisioned'
import { handleUserUpdated } from './handle-user-updated'

export type PortalEventHandler = (body: unknown) => Promise<void>

export type PortalEventHandlerMap = Partial<Record<string, PortalEventHandler>>

export interface DispatchOptions {
  handlers?: PortalEventHandlerMap
}

export const portalEventHandlers: PortalEventHandlerMap = {
  'alias.deleted': handleAliasDeleted,
  'alias.resolved': handleAliasResolved,
  'alias.updated': handleAliasUpdated,
  'app_config.updated': handleAppConfigUpdated,
  'employment.updated': handleEmploymentUpdated,
  'session.revoked': handleSessionRevoked,
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
