import { db } from '~/db'
import { identityUsers, workspaceSyncLog } from '~/db/schema'
import { eq } from 'drizzle-orm'
import { setGipUserDisabled, createGipUser } from '../gip-admin'
import { listAllWorkspaceUsers } from './workspace-client'

export interface SyncResult {
  logId: string
  status: 'completed' | 'failed'
  totalWorkspaceUsers: number
  created: number
  updated: number
  deactivated: number
  skipped: number
  errors: Array<{ email: string; message: string }>
}

export async function runWorkspaceSync(triggeredBy: string, options?: { dryRun?: boolean }): Promise<SyncResult> {
  const dryRun = options?.dryRun ?? process.env.WORKSPACE_SYNC_DRY_RUN === 'true'
  // 1. Concurrency guard
  const [existingRun] = await db
    .select()
    .from(workspaceSyncLog)
    .where(eq(workspaceSyncLog.status, 'running'))
    .limit(1)

  if (existingRun) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    if (existingRun.startedAt > fiveMinutesAgo) {
      throw new Error('Sync already in progress')
    }
    await db
      .update(workspaceSyncLog)
      .set({ status: 'failed', completedAt: new Date() })
      .where(eq(workspaceSyncLog.id, existingRun.id))
  }

  // 2. Insert running log row
  const [logRow] = await db
    .insert(workspaceSyncLog)
    .values({ status: 'running', triggeredBy })
    .returning({ id: workspaceSyncLog.id })

  const logId = logRow.id

  let created = 0
  let updated = 0
  let deactivated = 0
  let skipped = 0
  const errors: Array<{ email: string; message: string }> = []

  // 3. Fetch all Workspace users — fatal if this fails
  const workspaceUsers = await listAllWorkspaceUsers()

  // 4. Fetch all portal users with hasGoogleWorkspace = true, indexed by lowercase email
  const portalWorkspaceUsers = await db
    .select()
    .from(identityUsers)
    .where(eq(identityUsers.hasGoogleWorkspace, true))

  const portalByEmail = new Map(
    portalWorkspaceUsers.map((u) => [u.email.toLowerCase(), u])
  )

  // 5. Build a set of all Workspace emails for deprovisioning detection
  const workspaceEmailSet = new Set(
    workspaceUsers.map((u) => (u.primaryEmail ?? '').toLowerCase())
  )

  // 6. Per-user sync pass
  for (const wsUser of workspaceUsers) {
    const email = (wsUser.primaryEmail ?? '').toLowerCase()

    if (!email) {
      errors.push({ email: '', message: 'Workspace user has no primaryEmail' })
      continue
    }

    try {
      const isSuspendedOrArchived = wsUser.suspended === true || wsUser.archived === true
      const name = wsUser.name?.fullName ?? ''
      const department = wsUser.department
      const position = wsUser.title
      const phone = wsUser.phones?.[0]?.value

      const portalUser = portalByEmail.get(email)

      if (isSuspendedOrArchived) {
        if (portalUser && portalUser.status === 'active') {
          await db
            .update(identityUsers)
            .set({ status: 'inactive', updatedAt: new Date() })
            .where(eq(identityUsers.id, portalUser.id))

          if (!dryRun && portalUser.gipUid) {
            await setGipUserDisabled(portalUser.gipUid, true)
          }

          deactivated++
        } else {
          skipped++
        }
        continue
      }

      if (portalUser) {
        if (portalUser.status === 'inactive') {
          // Reactivate
          await db
            .update(identityUsers)
            .set({ status: 'active', updatedAt: new Date() })
            .where(eq(identityUsers.id, portalUser.id))

          if (!dryRun && portalUser.gipUid) {
            await setGipUserDisabled(portalUser.gipUid, false)
          }

          updated++
        } else {
          // Active — check for field drift
          const nameChanged = name !== '' && name !== portalUser.name
          const departmentChanged =
            department !== undefined && department !== (portalUser.department ?? undefined)
          const positionChanged =
            position !== undefined && position !== (portalUser.position ?? undefined)

          if (nameChanged || departmentChanged || positionChanged) {
            const patch: Record<string, unknown> = { updatedAt: new Date() }
            if (nameChanged) patch.name = name
            if (departmentChanged) patch.department = department
            if (positionChanged) patch.position = position

            await db
              .update(identityUsers)
              .set(patch)
              .where(eq(identityUsers.id, portalUser.id))

            updated++
          } else {
            skipped++
          }
        }
      } else {
        // New user — insert portal row then provision GIP
        const [newUser] = await db
          .insert(identityUsers)
          .values({
            email,
            name: name || email,
            phone,
            department,
            position,
            portalRole: 'employee',
            hasGoogleWorkspace: true,
            status: 'active',
          })
          .returning()

        if (!dryRun) {
          const tempPassword = crypto.randomUUID()
          const gipUid = await createGipUser(email, tempPassword)
          await db
            .update(identityUsers)
            .set({ gipUid, updatedAt: new Date() })
            .where(eq(identityUsers.id, newUser.id))
        }

        created++
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      errors.push({ email, message })
    }
  }

  // 7. Deprovisioning pass — portal Workspace users absent from current Workspace roster
  for (const [email, portalUser] of portalByEmail) {
    if (workspaceEmailSet.has(email)) continue
    if (portalUser.status === 'inactive') continue

    try {
      await db
        .update(identityUsers)
        .set({ status: 'inactive', updatedAt: new Date() })
        .where(eq(identityUsers.id, portalUser.id))

      if (!dryRun && portalUser.gipUid) {
        await setGipUserDisabled(portalUser.gipUid, true)
      }

      deactivated++
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      errors.push({ email, message })
    }
  }

  // 8. Finalize log row
  const totalWorkspaceUsers = workspaceUsers.length
  const allFailed = totalWorkspaceUsers > 0 && errors.length === totalWorkspaceUsers
  const finalStatus: 'completed' | 'failed' = allFailed ? 'failed' : 'completed'

  await db
    .update(workspaceSyncLog)
    .set({
      status: finalStatus,
      totalWorkspaceUsers,
      created,
      updated,
      deactivated,
      skipped,
      errors,
      completedAt: new Date(),
    })
    .where(eq(workspaceSyncLog.id, logId))

  return {
    logId,
    status: finalStatus,
    totalWorkspaceUsers,
    created,
    updated,
    deactivated,
    skipped,
    errors,
  }
}
