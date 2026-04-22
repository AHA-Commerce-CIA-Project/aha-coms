import { db } from '~/db'
import { identityUsers, teamMembers } from '~/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { resolveAndSyncClaims } from './claims'
import type { NewIdentityUser, IdentityUserSource } from '~/db/schema'
import { setGipUserDisabled } from '../gip-admin'
import { processEmployeeProvisioning } from './employee-provisioning'
import { revokePortalSession } from './session-revocation'
import { emitUserProvisioned, emitUserOffboarded, emitUserUpdated } from './provisioning-events'

export async function createEmployee(data: {
  email: string
  personalEmail?: string
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
}): Promise<{ id: string; provisioningStatus: string; provisioningError?: string }> {
  const [user] = await db.transaction(async (tx) => {
    const insertedUsers = await tx
      .insert(identityUsers)
      .values({
        email: data.email,
        personalEmail: data.personalEmail,
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

    const [insertedUser] = insertedUsers

    if (data.teamId) {
      await tx.insert(teamMembers).values({ teamId: data.teamId, userId: insertedUser.id })
    }

    return insertedUsers
  })

  const provisioning = await processEmployeeProvisioning(user.id)

  // Fire-and-forget: fan out user.provisioned after the transaction commits
  // and GIP provisioning has run (so gipUid is set). No await — does not block
  // the response. If the user has no teams yet, dispatchPortalWebhook is a no-op.
  emitUserProvisioned(user.id).catch((err) => {
    console.error(`[provisioning-events] emitUserProvisioned failed for ${user.id}:`, err)
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
    console.error(`[deactivateEmployee] revokePortalSession failed for ${userId}:`, err)
  }

  // Emit user.offboarded AFTER session.revoked so events arrive in order.
  // The user's team memberships still exist post-deactivation, so appSlugs
  // are resolved from current DB state (accurate for fanout).
  emitUserOffboarded(userId).catch((err) => {
    console.error(`[provisioning-events] emitUserOffboarded failed for ${userId}:`, err)
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
      .select({ id: identityUsers.id, gipUid: identityUsers.gipUid })
      .from(identityUsers)
      .where(inArray(identityUsers.id, ids))

    await Promise.all(
      users
        .filter((u) => u.gipUid)
        .map((u) => resolveAndSyncClaims(u.gipUid as string, u.id)),
    )

    // Fan out user.updated for each affected user — fire-and-forget
    for (const u of users) {
      emitUserUpdated(u.id, ['portalRole']).catch((err) => {
        console.error(`[provisioning-events] emitUserUpdated failed for ${u.id}:`, err)
      })
    }
  }

  return ids.length
}
