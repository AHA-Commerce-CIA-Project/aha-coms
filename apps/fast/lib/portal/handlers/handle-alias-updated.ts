import type { PortalEventHandler } from '../dispatch'

/**
 * `alias.updated` — portal informs subscribers that an email alias's
 * normalisation has changed. Heroes maintains an `alias_cache` table
 * + `drainPendingAliasQueue` because heroes' sheet-sync flow stages
 * pending-alias rows that need backfilling once an alias resolves
 * to a portal user. Fast has no alias cache and no sheet-sync
 * pending queue — fast addresses users by portal_sub, not by email
 * alias — so the only legitimate consumer surface is absent.
 *
 * Handler registered so the dispatch dedup table records receipt
 * and the dispatcher does not throw on an unknown event.
 */
export const handleAliasUpdated: PortalEventHandler = async () => {
  // intentional no-op — fast has no alias_cache or pending queue
}
