import { db } from '~/db'
import { identityUsers, teamMembers } from '~/db/schema'
import { eq } from 'drizzle-orm'
import { resolveAndSyncClaims } from './claims'
import type { NewIdentityUser } from '~/db/schema'
import { createGipUser, setGipUserDisabled, generatePasswordResetLink } from '../gip-admin'

export async function createEmployee(data: {
  email: string
  name: string
  phone?: string
  department?: string
  position?: string
  portalRole?: string
  teamId?: string
  hasGoogleWorkspace?: boolean
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
      hasGoogleWorkspace: data.hasGoogleWorkspace ?? false,
    } satisfies Omit<NewIdentityUser, 'id' | 'createdAt' | 'updatedAt'>)
    .returning({ id: identityUsers.id })

  // Provision a GIP user account and sync claims
  const tempPassword = crypto.randomUUID()
  const gipUid = await createGipUser(data.email, tempPassword)
  await db
    .update(identityUsers)
    .set({ gipUid, updatedAt: new Date() })
    .where(eq(identityUsers.id, user.id))
  await resolveAndSyncClaims(gipUid, user.id)
  await generatePasswordResetLink(data.email)

  if (data.teamId) {
    await db.insert(teamMembers).values({ teamId: data.teamId, userId: user.id })
  }

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
    await setGipUserDisabled(user.gipUid, true)
  }
}
