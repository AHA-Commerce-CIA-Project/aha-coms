import { eq } from 'drizzle-orm'
import { db } from '~/db'
import { identityUsers, type EmployeeProvisioningStatus } from '~/db/schema'
import { createGipUser, generatePasswordResetLink, setGipUserDisabled } from '../gip-admin'
import { resolveAndSyncClaims } from './claims'

export interface EmployeeProvisioningResult {
  status: EmployeeProvisioningStatus
  error?: string
}

export async function processEmployeeProvisioning(userId: string): Promise<EmployeeProvisioningResult> {
  const user = await db.query.identityUsers.findFirst({
    where: eq(identityUsers.id, userId),
  })

  if (!user) {
    throw new Error('Employee not found')
  }

  if (user.status !== 'active') {
    throw new Error('Cannot provision an inactive employee')
  }

  let gipUid = user.gipUid ?? null
  let createdThisAttempt = false
  let reenabledThisAttempt = false

  await db
    .update(identityUsers)
    .set({
      provisioningStatus: 'processing',
      provisioningError: null,
      updatedAt: new Date(),
    })
    .where(eq(identityUsers.id, userId))

  try {
    if (gipUid) {
      await setGipUserDisabled(gipUid, false)
      reenabledThisAttempt = true
    } else {
      const tempPassword = crypto.randomUUID()
      gipUid = await createGipUser(user.email, tempPassword)
      createdThisAttempt = true

      await db
        .update(identityUsers)
        .set({ gipUid, updatedAt: new Date() })
        .where(eq(identityUsers.id, userId))
    }

    await resolveAndSyncClaims(gipUid, userId)
    await generatePasswordResetLink(user.email)

    await db
      .update(identityUsers)
      .set({
        provisioningStatus: 'ready',
        provisioningError: null,
        updatedAt: new Date(),
      })
      .where(eq(identityUsers.id, userId))

    return { status: 'ready' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown provisioning error'

    if (gipUid && (createdThisAttempt || reenabledThisAttempt)) {
      try {
        await setGipUserDisabled(gipUid, true)
      } catch {
        // Best-effort cleanup only.
      }
    }

    await db
      .update(identityUsers)
      .set({
        provisioningStatus: 'failed',
        provisioningError: message,
        updatedAt: new Date(),
      })
      .where(eq(identityUsers.id, userId))

    return {
      status: 'failed',
      error: message,
    }
  }
}
