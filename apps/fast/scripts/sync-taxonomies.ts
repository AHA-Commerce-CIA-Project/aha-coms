/**
 * One-shot initial sync for portal-owned org taxonomies.
 *
 * Spec 05 Phase 7 / T78 — populate `taxonomy_cache` with every entry
 * portal currently exposes for the taxonomies fast subscribes to
 * (declared in apps/portal-api/scripts/spec07-register-fast.ts as
 * `TAXONOMIES = ['teams']`). After the script completes, ongoing
 * deltas ride the `taxonomy.upserted` + `taxonomy.deleted` webhooks
 * the consumer route already handles.
 *
 * Runbook (operator window, alongside the post-T77 webhook flip):
 *
 *   # 1. Authenticate as the fast runtime SA so the GoogleAuth client
 *   #    in lib/portal/portal-api-client.ts mints an ID token with the
 *   #    right `email` claim for portal-api's requireAppToken().
 *   gcloud auth application-default login \
 *     --impersonate-service-account=coms-fast-web-sa@fbi-dev-484410.iam.gserviceaccount.com
 *
 *   # 2. Open the Cloud SQL proxy on fast's DB (separate terminal).
 *   cloud-sql-proxy --port 5435 \
 *     fbi-dev-484410:asia-southeast2:aha-fast-db-instance-cd5db712
 *
 *   # 3. Point env at the fast DB + portal-api base URL.
 *   export DATABASE_URL='postgres://aha-fast-admin:<pw>@127.0.0.1:5435/aha-fast-db'
 *   export PORTAL_BASE_URL='https://aha-coms.web.app'
 *
 *   # 4. Run the sync.
 *   bun run apps/fast/scripts/sync-taxonomies.ts
 *
 * Output: `Synced N taxonomies, M entries` plus the per-taxonomy
 * counts. Re-running the script is safe — every row goes through the
 * same upsert path the webhook handler uses, so a partial run can be
 * retried without producing duplicates or stale rows.
 */
import { PrismaClient, type Prisma } from '@prisma/client'
import { fetchTaxonomySync } from '../lib/portal/portal-api-client'

async function main(): Promise<void> {
  const prisma = new PrismaClient()
  try {
    const response = await fetchTaxonomySync()

    let totalEntries = 0
    const now = new Date()

    for (const taxonomy of response.taxonomies) {
      for (const entry of taxonomy.entries) {
        await prisma.taxonomyCache.upsert({
          where: {
            taxonomyId_key: { taxonomyId: taxonomy.taxonomyId, key: entry.key },
          },
          create: {
            taxonomyId: taxonomy.taxonomyId,
            key: entry.key,
            value: entry.value,
            metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
            cachedAt: now,
          },
          update: {
            value: entry.value,
            metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
            cachedAt: now,
          },
        })
        totalEntries += 1
      }
      console.log(
        `[sync-taxonomies] ${taxonomy.taxonomyId}: ${taxonomy.entries.length} entries`,
      )
    }

    console.log(
      `[sync-taxonomies] Synced ${response.taxonomies.length} taxonomies, ${totalEntries} entries; portal syncedAt=${response.syncedAt}`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('[sync-taxonomies] Failed:', err)
    process.exit(1)
  },
)
