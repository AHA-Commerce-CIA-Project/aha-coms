// Spec 08 cutover-verify — runs at T+~25min in the cutover window. Five checks;
// any [FAIL] blocks Deploy C.
//
// Local invocation against staging:
//   1. Start Cloud SQL Auth Proxy in another shell:
//        cloud-sql-proxy fbi-dev-484410:asia-southeast2:coms-aha-heroes-db --port 5433
//   2. Pull the staging DB password and run:
//        DB_PASS=$(gcloud secrets versions access latest \
//          --secret=coms-aha-heroes-db-password --project=fbi-dev-484410)
//        DATABASE_URL="postgres://app:${DB_PASS}@127.0.0.1:5433/coms_aha_heroes_staging" \
//        PORTAL_BASE_URL="https://coms-portal-app-45tyczfska-et.a.run.app" \
//          bun run cutover:verify --since-iso=YYYY-MM-DDThh:mm:ssZ
//
// Auth note: Check 2 calls portal /api/taxonomies/sync, which requires an OIDC
// token whose `email` claim matches the Heroes Cloud Run SA registered in
// app_registry. Plain user-level ADC (`gcloud auth application-default login`)
// will NOT mint a token with the email claim — verification will fail with
// "missing_token". Either run with ADC impersonated as the Heroes SA
// (`gcloud auth application-default login --impersonate-service-account=
// coms-aha-heroes-run-sa@fbi-dev-484410.iam.gserviceaccount.com`) or run
// the script inside the staging Heroes Cloud Run container, where the
// metadata server provides email-bearing tokens automatically.
import { sql, count, gte } from 'drizzle-orm'
import { db } from '@coms/shared/db'
import {
  heroesProfiles,
  pendingAliasResolution,
  taxonomyCache,
} from '@coms/shared/db/schema'
import { fetchTaxonomySync } from '../packages/server/src/lib/portal-api-client'

interface CheckResult {
  id: number
  name: string
  status: 'pass' | 'fail' | 'manual'
  detail: string
}

function arg(name: string): string | null {
  const flag = `--${name}=`
  for (const a of process.argv) if (a.startsWith(flag)) return a.slice(flag.length)
  return null
}

async function checkTaxonomyCacheMatchesPortal(): Promise<CheckResult> {
  let portalSync
  try {
    portalSync = await fetchTaxonomySync()
  } catch (err) {
    return {
      id: 2,
      name: 'taxonomy_cache counts match portal',
      status: 'fail',
      detail: `failed to fetch /api/taxonomies/sync: ${(err as Error).message}`,
    }
  }

  const portalCounts = new Map<string, number>()
  for (const tax of portalSync.taxonomies) {
    portalCounts.set(tax.taxonomyId, tax.entries.length)
  }

  const heroesRows = await db
    .select({
      taxonomyId: taxonomyCache.taxonomyId,
      count: count(),
    })
    .from(taxonomyCache)
    .groupBy(taxonomyCache.taxonomyId)

  const heroesCounts = new Map<string, number>()
  for (const r of heroesRows) heroesCounts.set(r.taxonomyId, r.count)

  const mismatches: string[] = []
  const allIds = new Set([...portalCounts.keys(), ...heroesCounts.keys()])
  for (const id of allIds) {
    const p = portalCounts.get(id) ?? 0
    const h = heroesCounts.get(id) ?? 0
    if (p !== h) mismatches.push(`${id}: portal=${p} heroes=${h}`)
  }

  if (mismatches.length > 0) {
    return {
      id: 2,
      name: 'taxonomy_cache counts match portal',
      status: 'fail',
      detail: `mismatches: ${mismatches.join(', ')}`,
    }
  }
  return {
    id: 2,
    name: 'taxonomy_cache counts match portal',
    status: 'pass',
    detail: `${allIds.size} taxonomies, all counts match`,
  }
}

async function checkPendingAliasesPostStep5(sinceIso: string | null): Promise<CheckResult> {
  if (!sinceIso) {
    return {
      id: 3,
      name: 'pending_alias_resolution rows post-date sheet-ingestion (step 5)',
      status: 'manual',
      detail:
        'pass --since-iso=YYYY-MM-DDThh:mm:ssZ (the timestamp at which sheet-ingestion was kicked off) to automate this check',
    }
  }

  const since = new Date(sinceIso)
  if (Number.isNaN(since.getTime())) {
    return {
      id: 3,
      name: 'pending_alias_resolution rows post-date sheet-ingestion (step 5)',
      status: 'fail',
      detail: `invalid --since-iso value: ${sinceIso}`,
    }
  }

  const [pre] = await db
    .select({ count: count() })
    .from(pendingAliasResolution)
    .where(sql`${pendingAliasResolution.firstSeenAt} < ${since.toISOString()}`)
  const [post] = await db
    .select({ count: count() })
    .from(pendingAliasResolution)
    .where(gte(pendingAliasResolution.firstSeenAt, since))

  if ((pre?.count ?? 0) > 0) {
    return {
      id: 3,
      name: 'pending_alias_resolution rows post-date sheet-ingestion (step 5)',
      status: 'fail',
      detail: `found ${pre?.count} pending row(s) older than ${sinceIso} (orphaned cutover events)`,
    }
  }
  return {
    id: 3,
    name: 'pending_alias_resolution rows post-date sheet-ingestion (step 5)',
    status: 'pass',
    detail: `0 pre-${sinceIso} rows; ${post?.count ?? 0} post-step-5 rows`,
  }
}

async function reportHeroesProfilesCount(): Promise<CheckResult> {
  const [row] = await db
    .select({ count: count() })
    .from(heroesProfiles)
    .where(sql`${heroesProfiles.isActive} = true`)
  return {
    id: 1,
    name: 'heroes_profiles active count (compare against portal identity_users)',
    status: 'manual',
    detail: `heroes_profiles active count = ${row?.count ?? 0}; compare against portal admin API`,
  }
}

async function reportSpotCheckSamples(): Promise<CheckResult> {
  const samples = await db
    .select({
      id: heroesProfiles.id,
      name: heroesProfiles.name,
      branchKey: heroesProfiles.branchKey,
      teamKey: heroesProfiles.teamKey,
      departmentKey: heroesProfiles.departmentKey,
    })
    .from(heroesProfiles)
    .orderBy(sql`random()`)
    .limit(5)

  if (samples.length === 0) {
    return {
      id: 4,
      name: 'spot-check 5 heroes_profiles employment blocks',
      status: 'fail',
      detail: 'no heroes_profiles rows present — provisioning step 3 may not have run',
    }
  }

  const lines = samples
    .map(
      (s) =>
        `  ${s.id}  name=${s.name}  branch=${s.branchKey ?? '-'}  team=${s.teamKey ?? '-'}  dept=${s.departmentKey ?? '-'}`,
    )
    .join('\n')
  return {
    id: 4,
    name: 'spot-check 5 heroes_profiles employment blocks',
    status: 'manual',
    detail: `compare each sample below against portal admin API:\n${lines}`,
  }
}

function reportPermissionRevoke(): CheckResult {
  return {
    id: 5,
    name: 'heroes SA forced INSERT INTO identity_users → permission denied',
    status: 'manual',
    detail:
      'run from staging with the heroes SA: `psql -c "INSERT INTO identity_users(...) VALUES (...);"` — must fail with permission denied',
  }
}

async function main() {
  const sinceIso = arg('since-iso')
  const results: CheckResult[] = []

  results.push(await reportHeroesProfilesCount())
  results.push(await checkTaxonomyCacheMatchesPortal())
  results.push(await checkPendingAliasesPostStep5(sinceIso))
  results.push(await reportSpotCheckSamples())
  results.push(reportPermissionRevoke())

  console.log('\n=== Spec 08 cutover-verify ===')
  for (const r of results) {
    const tag =
      r.status === 'pass' ? '[PASS]' : r.status === 'fail' ? '[FAIL]' : '[MANUAL]'
    console.log(`${tag}  Check ${r.id}: ${r.name}`)
    console.log(`        ${r.detail}`)
  }

  const failed = results.filter((r) => r.status === 'fail').length
  const manual = results.filter((r) => r.status === 'manual').length
  console.log(
    `\nSummary: ${results.length - failed - manual} pass, ${failed} fail, ${manual} manual`,
  )
  process.exit(failed > 0 ? 1 : 0)
}

if (import.meta.main) {
  main().catch((err) => {
    console.error('[cutover-verify] unexpected error:', err)
    process.exit(2)
  })
}
