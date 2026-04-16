import { db } from '~/db'
import { identityUsers, teamMembers } from '~/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { resolveAndSyncClaims } from './claims'
import type { NewIdentityUser } from '~/db/schema'
import { setGipUserDisabled } from '../gip-admin'
import { processEmployeeProvisioning } from './employee-provisioning'

export async function createEmployee(data: {
  email: string
  name: string
  phone?: string
  department?: string
  position?: string
  portalRole?: string
  teamId?: string
  hasGoogleWorkspace?: boolean
}): Promise<{ id: string; provisioningStatus: string; provisioningError?: string }> {
  const [user] = await db.transaction(async (tx) => {
    const insertedUsers = await tx
      .insert(identityUsers)
      .values({
        email: data.email,
        name: data.name,
        phone: data.phone,
        department: data.department,
        position: data.position,
        portalRole: data.portalRole ?? 'employee',
        hasGoogleWorkspace: data.hasGoogleWorkspace ?? false,
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
  }

  return ids.length
}
