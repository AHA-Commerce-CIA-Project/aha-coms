/**
 * Alias event emitters — thin helpers that construct alias event payloads
 * and fan out via dispatchPortalWebhook.
 *
 * Called by the alias service after mutations commit. Fire-and-forget: callers
 * do not need to await these; dispatchPortalWebhook kicks off parallel
 * deliveries internally.
 *
 * The alias row shape used here is a structural subset — callers pass any
 * object satisfying AliasRow without importing a specific schema type.
 */

import { dispatchPortalWebhook } from './portal-webhook-fanout'
import type {
  AliasResolvedPayload,
  AliasUpdatedPayload,
  AliasDeletedPayload,
} from '@coms-portal/shared'

// Structural alias row — matches the subset of user_aliases columns we need.
// The alias service owns the full schema type; we only require what we use.
export interface AliasRow {
  id: string
  aliasNormalized: string
  identityUserId: string
  isPrimary: boolean
}

export interface AliasUpdatedOptions {
  previousIsPrimary?: boolean
  previousIdentityUserId?: string
}

/**
 * Emit alias.resolved after a new alias row has been committed.
 * Fans out to all apps subscribed to alias.resolved (no per-app filter —
 * alias events broadcast to all subscribed endpoints).
 */
export async function emitAliasResolved(alias: AliasRow): Promise<void> {
  const payload: AliasResolvedPayload = {
    aliasId: alias.id,
    aliasNormalized: alias.aliasNormalized,
    portalSub: alias.identityUserId,
    isPrimary: alias.isPrimary,
  }
  await dispatchPortalWebhook('alias.resolved', payload)
}

/**
 * Emit alias.updated after an alias row has been modified.
 *
 * A primary rename produces two calls — one for the demote (isPrimary: false,
 * previousIsPrimary: true) and one for the promote (isPrimary: true,
 * previousIsPrimary: false). The alias service is responsible for sequencing.
 */
export async function emitAliasUpdated(
  alias: AliasRow,
  opts: AliasUpdatedOptions = {},
): Promise<void> {
  const payload: AliasUpdatedPayload = {
    aliasId: alias.id,
    aliasNormalized: alias.aliasNormalized,
    portalSub: alias.identityUserId,
    isPrimary: alias.isPrimary,
    ...(opts.previousIsPrimary !== undefined && { previousIsPrimary: opts.previousIsPrimary }),
    ...(opts.previousIdentityUserId !== undefined && {
      previousIdentityUserId: opts.previousIdentityUserId,
    }),
  }
  await dispatchPortalWebhook('alias.updated', payload)
}

/**
 * Emit alias.deleted after an alias row has been removed.
 */
export async function emitAliasDeleted(alias: AliasRow): Promise<void> {
  const payload: AliasDeletedPayload = {
    aliasId: alias.id,
    aliasNormalized: alias.aliasNormalized,
    portalSub: alias.identityUserId,
  }
  await dispatchPortalWebhook('alias.deleted', payload)
}
