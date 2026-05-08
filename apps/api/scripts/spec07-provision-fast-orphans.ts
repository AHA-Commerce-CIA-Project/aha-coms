/**
 * Spec 07 §Phase 1C — Provision Fast orphan(s) into portal identity.
 *
 * Phase 0 surfaced 5 orphans, 4 of which were deleted from Fast pre-rekey
 * (test/role mailboxes — see `docs/architecture/rev4/spec-07-artifacts/0-orphan-inventory.md`).
 * The remaining 1 (`admin@gmail.com`) is the only kept orphan and the only
 * input to this script.
 *
 * Runbook:
 *   DATABASE_URL=<portal-db-url> bun run --cwd apps/api spec07:provision-fast-orphans
 *
 * Idempotent: if the email is already known to portal (i.e. `identity_user_emails`
 * row exists for `admin@gmail.com`), the script logs the existing identity_users.id
 * and exits 0.
 *
 * Note on routing around `createEmployee`:
 *   The intended code path is `services/employees.createEmployee`. Phase 1C
 *   discovered that path has a latent bug since Spec 06 PR A (commit 049008d):
 *   `insertIdentityEmailsForNewUser` passes `emailNormalized` explicitly to
 *   the INSERT, but Postgres rejects it (the column is GENERATED ALWAYS AS).
 *   Filed as a follow-up; out of Spec 07 scope. This script replicates the
 *   relevant inserts directly using the same `Partial` cast trick that
 *   `seed-admin.ts` uses to omit the generated column.
 *
 *   The emitted `user.provisioned` event still uses the production
 *   `provisioning-events` service, so Fast will see the same event shape it
 *   would see from any other provisioning path.
 */
import { db } from '~/db'
import { identityUserEmails, identityUsers } from '~/db/schema'
import { eq, sql } from 'drizzle-orm'
import { seedAppUserConfigForUser } from '~/services/app-user-config'
import { emitUserProvisioned } from '~/services/provisioning-events'
import { logger } from '~/logger'

const ORPHAN = {
  personalEmail: 'admin@gmail.com',
  name: 'Admin',
  // Fast's User.role='admin' is an app-domain attribute, surfaced via
  // app_user_config / envelope.appRole, not portalRole. portalRole stays
  // 'employee' (default) so this user does not get portal admin UI access
  // by default.
  portalRole: 'employee' as const,
  source: 'manual' as const,
  addedBy: 'admin' as const,
}

async function main() {
  const personalNormalized = ORPHAN.personalEmail.toLowerCase().trim()

  const existing = await db
    .select({
      id: identityUserEmails.id,
      identityUserId: identityUserEmails.identityUserId,
    })
    .from(identityUserEmails)
    .where(sql`LOWER(TRIM(${identityUserEmails.email})) = ${personalNormalized}`)
    .limit(1)

  if (existing.length > 0) {
    const linked = await db
      .select({ id: identityUsers.id, status: identityUsers.status, name: identityUsers.name })
      .from(identityUsers)
      .where(eq(identityUsers.id, existing[0].identityUserId))
      .limit(1)
    console.log(
      `[spec07-provision-fast-orphans] ${ORPHAN.personalEmail} already provisioned: identity_users.id=${linked[0]?.id}, status=${linked[0]?.status}, name="${linked[0]?.name}". Nothing to do.`,
    )
    return
  }

  const newUserId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(identityUsers)
      .values({
        name: ORPHAN.name,
        portalRole: ORPHAN.portalRole,
        source: ORPHAN.source,
        status: 'active',
        hasGoogleWorkspace: false,
      })
      .returning({ id: identityUsers.id })

    await tx
      .insert(identityUserEmails)
      .values({
        identityUserId: inserted.id,
        email: ORPHAN.personalEmail,
        // email_normalized is GENERATED ALWAYS AS in Postgres; omitted here.
        kind: 'personal',
        isPrimary: true,
        verifiedAt: new Date(),
        addedBy: ORPHAN.addedBy,
      } as Partial<typeof identityUserEmails.$inferInsert> as typeof identityUserEmails.$inferInsert)

    await seedAppUserConfigForUser(tx, inserted.id)

    return inserted.id
  })

  console.log(
    `[spec07-provision-fast-orphans] Provisioned ${ORPHAN.personalEmail} → identity_users.id=${newUserId}.`,
  )

  emitUserProvisioned(newUserId).catch((err) => {
    logger.error({ err, userId: newUserId }, '[spec07-provision-fast-orphans] emitUserProvisioned failed')
  })

  console.log(
    `[spec07-provision-fast-orphans] user.provisioned event emitted (Fast endpoint is currently 'disabled' so the event will be DLQ'd or skipped — that's expected).`,
  )
  console.log(
    `[spec07-provision-fast-orphans] Phase 2C will backfill aha-fast User.portalSub = ${newUserId} for the row with email=${ORPHAN.personalEmail}.`,
  )
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('[spec07-provision-fast-orphans] Failed:', err)
    process.exit(1)
  },
)
