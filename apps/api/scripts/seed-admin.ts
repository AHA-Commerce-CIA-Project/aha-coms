/**
 * Spec 06 §PR-A — Seed the bootstrap admin identity row.
 *
 * Runbook:
 *   bun run --cwd apps/api db:seed-admin
 *
 * Idempotent: exits 0 with a log message if the admin workspace email row
 * already exists and links to a healthy identity_users row.
 *
 * Required env when admin provisioning is desired:
 *   BOOTSTRAP_ADMIN_EMAIL  — workspace email address (e.g. handers.the@ahacommerce.net)
 *   BOOTSTRAP_ADMIN_NAME   — display name (required if BOOTSTRAP_ADMIN_EMAIL is set)
 *
 * Optional env:
 *   BOOTSTRAP_ADMIN_PERSONAL_EMAIL — personal email to register as a second row
 *
 * Note: email_normalized is a Postgres GENERATED ALWAYS AS column. We bypass
 * Drizzle's strict insert shape by casting to `Partial` so we only pass the
 * columns we own; Postgres computes email_normalized automatically.
 */
import { db } from '~/db'
import { identityUsers, identityUserEmails } from '~/db/schema'
import { eq, sql } from 'drizzle-orm'

async function main() {
  const rawEmail = process.env.BOOTSTRAP_ADMIN_EMAIL
  if (!rawEmail) {
    console.log('[seed-admin] BOOTSTRAP_ADMIN_EMAIL not set — no bootstrap admin configured, skipping.')
    return
  }

  const adminName = process.env.BOOTSTRAP_ADMIN_NAME
  if (!adminName) {
    throw new Error('[seed-admin] BOOTSTRAP_ADMIN_NAME is required when BOOTSTRAP_ADMIN_EMAIL is set.')
  }

  const adminEmail = rawEmail.trim()
  const adminEmailNormalized = adminEmail.toLowerCase()
  const personalEmail = process.env.BOOTSTRAP_ADMIN_PERSONAL_EMAIL?.trim() || null

  await db.transaction(async (tx) => {
    // Look up by normalized email via the GENERATED column.
    const existingEmailRows = await tx
      .select({
        id: identityUserEmails.id,
        identityUserId: identityUserEmails.identityUserId,
      })
      .from(identityUserEmails)
      .where(sql`LOWER(TRIM(${identityUserEmails.email})) = ${adminEmailNormalized}`)
      .limit(1)

    if (existingEmailRows.length > 0) {
      const { identityUserId } = existingEmailRows[0]

      // Check the linked identity_users row is intact.
      const linkedUser = await tx
        .select({ id: identityUsers.id, status: identityUsers.status })
        .from(identityUsers)
        .where(eq(identityUsers.id, identityUserId))
        .limit(1)

      if (linkedUser.length === 0) {
        // Orphan email row — DB inconsistency; do not attempt to auto-repair.
        console.warn(
          `[seed-admin] WARNING: identity_user_emails row exists for ${adminEmail} but the linked identity_users row (id=${identityUserId}) is missing. This is a DB inconsistency that requires manual investigation.`,
        )
        return
      }

      console.log(
        `[seed-admin] Bootstrap admin already exists (identity_users.id=${linkedUser[0].id}, status=${linkedUser[0].status}); nothing to do.`,
      )
      return
    }

    // No existing email row — insert fresh identity_users + email row(s).
    const [newUser] = await tx
      .insert(identityUsers)
      .values({
        name: adminName,
        portalRole: 'admin',
        status: 'active',
        source: 'manual',
        hasGoogleWorkspace: true,
      })
      .returning({ id: identityUsers.id })

    console.log(`[seed-admin] Inserted identity_users row: id=${newUser.id}`)

    // Insert workspace email row.
    // Cast to Partial to omit emailNormalized — it is a GENERATED ALWAYS AS
    // column in Postgres; the database computes it. Drizzle's inferred insert
    // type marks it as required (no TS-level default), so we bypass with Partial.
    await tx
      .insert(identityUserEmails)
      .values({
        identityUserId: newUser.id,
        email: adminEmail,
        kind: 'workspace',
        addedBy: 'bootstrap',
        verifiedAt: sql`NOW()`,
        isPrimary: true,
      } as Partial<typeof identityUserEmails.$inferInsert> as typeof identityUserEmails.$inferInsert)

    console.log(`[seed-admin] Inserted workspace email row: ${adminEmail}`)

    // Optionally insert personal email row.
    if (personalEmail) {
      await tx
        .insert(identityUserEmails)
        .values({
          identityUserId: newUser.id,
          email: personalEmail,
          kind: 'personal',
          addedBy: 'bootstrap',
          verifiedAt: sql`NOW()`,
          isPrimary: false,
        } as Partial<typeof identityUserEmails.$inferInsert> as typeof identityUserEmails.$inferInsert)

      console.log(`[seed-admin] Inserted personal email row: ${personalEmail}`)
    }

    console.log(`[seed-admin] Bootstrap admin seeded successfully (name="${adminName}", email=${adminEmail}).`)
  })
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('[seed-admin] Failed:', err)
    process.exit(1)
  },
)
