/**
 * Backfill `User.portal_sub` from portal's identity_user_emails.
 *
 * Spec 05 Phase 3 / T60 — sub-phase (a).
 *
 * Cross-database backfill: portal's `identity_users` + `identity_user_emails`
 * live in the portal DB; fast's `User` lives in the fast DB. Both databases
 * sit on the same Cloud SQL instance, but cross-database SQL is friction in
 * Postgres (postgres_fdw setup, foreign-server provisioning). The operator
 * exports an email→portal-sub map from portal's DB as a CSV, then this
 * script joins against it via Prisma against fast's DB.
 *
 * Operator runbook:
 *
 *   # 1. Open the Cloud SQL proxy (one terminal).
 *   cloud-sql-proxy --port 5433 \
 *     fbi-dev-484410:asia-southeast1:coms-portal-db-prod
 *
 *   # 2. Export the email→portal-sub map from portal (another terminal).
 *   psql "postgres://coms-portal-app:<pw>@localhost:5433/coms_portal_prod" \
 *     -c "\copy (SELECT email_normalized, identity_user_id FROM identity_user_emails) TO 'portal-emails.csv' WITH CSV HEADER"
 *
 *   # 3. Point fast's DATABASE_URL at the same proxy (different db).
 *   export DATABASE_URL='postgres://aha-fast-admin:<pw>@localhost:5433/aha-fast-db'
 *
 *   # 4. Run the backfill (dry run first).
 *   bun run apps/fast/scripts/backfill-portal-sub.ts portal-emails.csv --dry-run
 *   bun run apps/fast/scripts/backfill-portal-sub.ts portal-emails.csv
 *
 * Output: `N updated, M still null` — M is the operator-outreach population
 * (fast users with no matching portal identity, e.g. test accounts or
 * employees who were created in fast before portal's identity row landed).
 */
import { PrismaClient } from '@prisma/client'

type PortalEmailRow = { email_normalized: string; identity_user_id: string }

function parseCsv(text: string): PortalEmailRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length < 2) return []
  const header = lines[0]!.split(',').map((s) => s.trim())
  const emailIdx = header.indexOf('email_normalized')
  const subIdx = header.indexOf('identity_user_id')
  if (emailIdx === -1 || subIdx === -1) {
    throw new Error(
      `CSV must have header "email_normalized,identity_user_id" — got "${lines[0]}"`,
    )
  }
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((s) => s.trim())
    return {
      email_normalized: cols[emailIdx]!,
      identity_user_id: cols[subIdx]!,
    }
  })
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

async function main() {
  const csvPath = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')
  if (!csvPath) {
    console.error(
      'Usage: bun run backfill-portal-sub.ts <portal-emails.csv> [--dry-run]',
    )
    process.exit(1)
  }

  const csvText = await Bun.file(csvPath).text()
  const portalRows = parseCsv(csvText)
  console.log(`Loaded ${portalRows.length} portal email rows.`)

  const portalSubByEmail = new Map<string, string>()
  for (const row of portalRows) {
    portalSubByEmail.set(normalizeEmail(row.email_normalized), row.identity_user_id)
  }

  const prisma = new PrismaClient()
  try {
    const users = await prisma.user.findMany({
      where: { portal_sub: null },
      select: { id: true, email: true },
    })
    console.log(`${users.length} fast users without portal_sub.`)

    let updated = 0
    let stillNull = 0
    const stillNullEmails: string[] = []

    for (const user of users) {
      const sub = portalSubByEmail.get(normalizeEmail(user.email))
      if (!sub) {
        stillNull += 1
        stillNullEmails.push(user.email)
        continue
      }
      if (dryRun) {
        updated += 1
        continue
      }
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { portal_sub: sub },
        })
        updated += 1
      } catch (err) {
        // Unique-index violation (two fast users mapped to one portal_sub)
        // is the failure mode worth catching loudly — surface and skip so
        // the operator can resolve the duplicate before re-running.
        console.error(`SKIP user ${user.id} (${user.email}):`, err)
        stillNull += 1
        stillNullEmails.push(user.email)
      }
    }

    console.log(`${updated} updated${dryRun ? ' (dry run — no writes)' : ''}, ${stillNull} still null.`)
    if (stillNullEmails.length > 0) {
      console.log('Emails without a portal match (operator-outreach list):')
      for (const e of stillNullEmails) console.log(`  - ${e}`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
