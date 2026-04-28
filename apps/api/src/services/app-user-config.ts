import { db } from '~/db'
import { appUserConfig } from '~/db/schema'
import { loadAllManifests, seedDefaults } from './manifests'
import type { ManifestDefinition } from './manifests'

// The transaction object passed by drizzle's db.transaction() has the same
// insert/select/update interface as db itself.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Seeds one app_user_config row per registered app for a newly created user.
 * Must be called within an active transaction so the seed and identity_users
 * insert share the same transaction boundary.
 */
export async function seedAppUserConfigForUser(tx: Tx, userId: string): Promise<void> {
  const manifests = await loadAllManifests()
  if (manifests.length === 0) return

  for (const row of manifests) {
    const manifest: ManifestDefinition = {
      appId: row.appId,
      displayName: row.displayName,
      schemaVersion: row.schemaVersion,
      configSchema: row.configSchema as ManifestDefinition['configSchema'],
    }

    const defaults = seedDefaults(manifest)

    await tx
      .insert(appUserConfig)
      .values({
        portalSub: userId,
        appId: row.appId,
        config: defaults,
        schemaVersion: row.schemaVersion,
      })
      .onConflictDoNothing()
  }
}
