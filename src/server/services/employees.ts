import { getAuth } from 'firebase-admin/auth'
import { db } from '~/db'
import { identityUsers, teamMembers } from '~/db/schema'
import { eq } from 'drizzle-orm'
import { resolveAndSyncClaims } from './claims'
import type { NewIdentityUser } from '~/db/schema'

export async function createEmployee(data: {
  email: string
  name: string
  phone?: string
  department?: string
  position?: string
  portalRole?: string
  teamId?: string
}): Promise<{ id: string }> {
  const [user] = await db
    .insert(identityUsers)
    .values({
      email: data.email,
      name: data.name,
      phone: data.phone,
      department: data.department,
      position: data.position,
      portalRole: data.portalRole ?? 'employee',
    } satisfies Omit<NewIdentityUser, 'id' | 'createdAt' | 'updatedAt'>)
    .returning({ id: identityUsers.id })

  const gipUser = await getAuth().createUser({
    email: data.email,
    displayName: data.name,
    emailVerified: false,
  })

  await db
    .update(identityUsers)
    .set({ gipUid: gipUser.uid, updatedAt: new Date() })
    .where(eq(identityUsers.id, user.id))

  if (data.teamId) {
    await db.insert(teamMembers).values({ teamId: data.teamId, userId: user.id })
  }

  await resolveAndSyncClaims(gipUser.uid, user.id)

  // Send password-setup welcome email
  await getAuth().generatePasswordResetLink(data.email)

  return { id: user.id }
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
    await getAuth().updateUser(user.gipUid, { disabled: true })
  }
}
