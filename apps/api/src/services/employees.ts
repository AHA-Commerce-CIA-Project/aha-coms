import { db } from '~/db'
import { identityUsers, teamMembers, identityUserEmails } from '~/db/schema'
import { eq, inArray } from 'drizzle-orm'
import type { NewIdentityUser, IdentityUserSource } from '~/db/schema'
import { setGipUserDisabled } from '../gip-admin'
import { processEmployeeProvisioning } from './employee-provisioning'
import { revokePortalSession } from './session-revocation'
import { emitUserProvisioned, emitUserOffboarded, emitUserUpdated } from './provisioning-events'
import { seedAppUserConfigForUser } from './app-user-config'
import { logger } from '~/logger'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

type EmailAddedBy = 'admin' | 'csv_import' | 'sheet_sync' | 'bootstrap'

export type CreateEmployeeInput = {
  /** Workspace (Google) email. Optional per Q4a — at least one of workspaceEmail/personalEmail required. */
  workspaceEmail?: string
  /** Personal email. Optional per Q4a — at least one of workspaceEmail/personalEmail required. */
  personalEmail?: string
  /** @deprecated Pass workspaceEmail instead. Kept for backward-compat call-sites during migration. */
  email?: string
  name: string
  phone?: string
  department?: string
  position?: string
  branch?: string

  birthDate?: string
  leaderName?: string
  portalRole?: string
  teamId?: string
  hasGoogleWorkspace?: boolean
  source?: IdentityUserSource
  /** Override the addedBy value for identity_user_emails rows. Defaults to 'admin'. */
  addedBy?: EmailAddedBy
}

type ResolvedCreateEmployeeEmails = {
  workspaceEmail?: string
  personalEmail?: string
  addedBy: EmailAddedBy
}

function resolveCreateEmployeeEmails(data: CreateEmployeeInput): ResolvedCreateEmployeeEmails {
  // Callers may pass `email` (workspace) or `workspaceEmail`. Prefer workspaceEmail.
  const workspaceEmail = data.workspaceEmail ?? data.email ?? undefined
  const personalEmail = data.personalEmail ?? undefined
  const addedBy: EmailAddedBy = data.addedBy ?? 'admin'

  if (!workspaceEmail && !personalEmail) {
    throw new Error('At least one of workspaceEmail or personalEmail is required (Q4a)')
  }

  return { workspaceEmail, personalEmail, addedBy }
}

/**
 * Insert workspace and/or personal email rows for a freshly-created identity user.
 * Per Q4b/c: admin-entered emails are trusted on entry (verifiedAt set to now).
 * Per Q8a: workspace takes isPrimary precedence; if both present, workspace=primary.
 */
async function insertIdentityEmailsForNewUser(
  tx: Tx,
  userId: string,
  emails: ResolvedCreateEmployeeEmails,
  now: Date,
): Promise<void> {
  if (emails.workspaceEmail) {
    await tx.insert(identityUserEmails).values({
      identityUserId: userId,
      email: emails.workspaceEmail,
      emailNormalized: emails.workspaceEmail.toLowerCase().trim(),
      kind: 'workspace',
      isPrimary: true,
      verifiedAt: now,
      addedBy: emails.addedBy,
    })
  }
  if (emails.personalEmail) {
    await tx.insert(identityUserEmails).values({
      identityUserId: userId,
      email: emails.personalEmail,
      emailNormalized: emails.personalEmail.toLowerCase().trim(),
      kind: 'personal',
      isPrimary: !emails.workspaceEmail,
      verifiedAt: now,
      addedBy: emails.addedBy,
    })
  }
}

async function insertIdentityUserRow(
  tx: Tx,
  data: CreateEmployeeInput,
): Promise<{ id: string }> {
  const [insertedUser] = await tx
    .insert(identityUsers)
    .values({
      name: data.name,
      phone: data.phone,
      department: data.department,
      position: data.position,
      branch: data.branch,

      birthDate: data.birthDate,
      leaderName: data.leaderName,
      portalRole: data.portalRole ?? 'employee',
      hasGoogleWorkspace: data.hasGoogleWorkspace ?? false,
      source: data.source ?? 'manual',
      provisioningStatus: 'pending',
      provisioningError: null,
    } satisfies Omit<NewIdentityUser, 'id' | 'createdAt' | 'updatedAt'>)
    .returning({ id: identityUsers.id })
  return insertedUser
}

export async function createEmployee(
  data: CreateEmployeeInput,
): Promise<{ id: string; provisioningStatus: string; provisioningError?: string }> {
  const emails = resolveCreateEmployeeEmails(data)

  const user = await db.transaction(async (tx) => {
    const inserted = await insertIdentityUserRow(tx, data)
    const now = new Date()

    await insertIdentityEmailsForNewUser(tx, inserted.id, emails, now)

    if (data.teamId) {
      await tx.insert(teamMembers).values({ teamId: data.teamId, userId: inserted.id })
    }

    await seedAppUserConfigForUser(tx, inserted.id)

    return inserted
  })

  const provisioning = await processEmployeeProvisioning(user.id)

  // Fire-and-forget: fan out user.provisioned after the transaction commits
  // and GIP provisioning has run (so gipUid is set). No await — does not block
  // the response. If the user has no teams yet, dispatchPortalWebhook is a no-op.
  emitUserProvisioned(user.id).catch((err) => {
    logger.error({ err, userId: user.id }, '[provisioning-events] emitUserProvisioned failed')
  })

  return {
    id: user.id,
    provisioningStatus: provisioning.status,
    ...(provisioning.error ? { provisioningError: provisioning.error } : {}),
  }
}

export async function deactivateEmployee(userId: string): Promise<void> {
  const user = await db.query.identityUsers.findFirst({
    where: eq(identityUsers.id, userId),
  })

  if (!user) throw new Error('Employee not found')

  await db
    .update(identityUsers)
    .set({ status: 'inactive', updatedAt: new Date() })
    .where(eq(identityUsers.id, userId))

  if (user.gipUid) {
    await setGipUserDisabled(user.gipUid, true)
  }

  // Revoke portal sessions and fan out webhooks.
  // revokeRefreshTokens is called inside revokePortalSession, so we do NOT
  // call setGipUserDisabled + revokeRefreshTokens separately — but setGipUserDisabled
  // is a distinct operation (disables account, not just tokens) and remains above.
  // revokePortalSession handles the refresh-token revocation side independently.
  try {
    await revokePortalSession({ userId, reason: 'offboarded' })
  } catch (err) {
    logger.error({ err, userId }, '[deactivateEmployee] revokePortalSession failed')
  }

  // Emit user.offboarded AFTER session.revoked so events arrive in order.
  // The user's team memberships still exist post-deactivation, so appSlugs
  // are resolved from current DB state (accurate for fanout).
  emitUserOffboarded(userId).catch((err) => {
    logger.error({ err, userId }, '[provisioning-events] emitUserOffboarded failed')
  })
}

export async function batchUpdateEmployees(
  ids: string[],
  field: 'portalRole',
  value: string,
): Promise<number> {
  if (ids.length === 0) return 0

  await db
    .update(identityUsers)
    .set({ [field]: value, updatedAt: new Date() })
    .where(inArray(identityUsers.id, ids))

  if (field === 'portalRole') {
    const users = await db
      .select({ id: identityUsers.id })
      .from(identityUsers)
      .where(inArray(identityUsers.id, ids))

    // Claims are recomputed from DB per-request post-Q-claims; no GIP-side sync needed.
    // Fan out user.updated for each affected user — fire-and-forget.
    for (const u of users) {
      emitUserUpdated(u.id, ['portalRole']).catch((err) => {
        logger.error({ err, userId: u.id }, '[provisioning-events] emitUserUpdated failed')
      })
    }
  }

  return ids.length
}
