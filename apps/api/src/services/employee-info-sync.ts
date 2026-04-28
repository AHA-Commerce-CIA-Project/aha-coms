import { db } from '~/db'
import { identityUsers, teams, teamMembers } from '~/db/schema'
import { eq, ilike } from 'drizzle-orm'
import { readEmployeeInfoSheet, type EmployeeInfoSheetRow } from './sheets-client'
import { findBestMatch } from './name-matching'
import { emitUserProvisioned } from './provisioning-events'

export interface EmployeeInfoSyncResult {
  updated: number
  created: Array<{ sheetName: string; personalEmail: string; userId: string }>
  matched: Array<{ sheetName: string; dbName: string; email: string }>
  unmatched: Array<{ sheetName: string; reason: string }>
  errors: string[]
}

export async function syncEmployeeInfo(): Promise<EmployeeInfoSyncResult> {
  const result: EmployeeInfoSyncResult = {
    updated: 0,
    created: [],
    matched: [],
    unmatched: [],
    errors: [],
  }

  let sheetRows: EmployeeInfoSheetRow[]
  try {
    sheetRows = await readEmployeeInfoSheet()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    result.errors.push(`Failed to read Google Sheet: ${message}`)
    return result
  }

  if (sheetRows.length === 0) {
    result.errors.push('No rows found in the employee info sheet')
    return result
  }

  const employees = await db
    .select({ id: identityUsers.id, name: identityUsers.name, email: identityUsers.email })
    .from(identityUsers)
    .where(eq(identityUsers.status, 'active'))

  const toCreate: EmployeeInfoSheetRow[] = []

  for (const row of sheetRows) {
    const { match, score, ambiguous } = findBestMatch(row.fullName, employees)

    if (ambiguous) {
      result.unmatched.push({
        sheetName: row.fullName,
        reason: 'Multiple employees match — needs manual review',
      })
      continue
    }

    if (!match || score === 0) {
      // If the row has a personal email, queue for creation; otherwise mark unmatched
      if (row.personalEmail) {
        toCreate.push(row)
      } else {
        result.unmatched.push({
          sheetName: row.fullName,
          reason: 'No matching employee found',
        })
      }
      continue
    }

    try {
      // Build properly typed update payload — only set fields that have a value in the sheet
      const fields: Partial<typeof identityUsers.$inferInsert> = { updatedAt: new Date() }
      if (row.personalEmail) fields.personalEmail = row.personalEmail
      if (row.phone) fields.phone = row.phone
      if (row.birthDate) fields.birthDate = row.birthDate
      if (row.position) fields.position = row.position
      if (row.leaderName) fields.leaderName = row.leaderName

      await db.update(identityUsers).set(fields).where(eq(identityUsers.id, match.id))

      // Handle team membership
      if (row.teamName) {
        await upsertTeamMembership(match.id, row.teamName)
      }

      result.matched.push({ sheetName: row.fullName, dbName: match.name, email: match.email })
      result.updated++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push(`Failed to update ${match.email}: ${message}`)
    }
  }

  // Create non-workspace employees for unmatched rows that have a personal email
  const { createEmployee } = await import('./employees')
  const CONCURRENCY = 5
  for (let i = 0; i < toCreate.length; i += CONCURRENCY) {
    const batch = toCreate.slice(i, i + CONCURRENCY)
    const settled = await Promise.allSettled(
      batch.map((row) =>
        createEmployee({
          email: row.personalEmail,
          name: row.fullName,
          hasGoogleWorkspace: false,
          source: 'sheet_sync',
        }).then((newUser) => ({ row, userId: newUser.id })),
      ),
    )
    for (const [idx, s] of settled.entries()) {
      if (s.status === 'fulfilled') {
        result.created.push({
          sheetName: s.value.row.fullName,
          personalEmail: s.value.row.personalEmail,
          userId: s.value.userId,
        })
        // Fire-and-forget: emit user.provisioned for sheet-sync-created users
        // (Rev 2 gap: createEmployee has no team membership at this point so
        // its own emit is a no-op; this fires after the batch where team context
        // may be updated by subsequent sync runs).
        emitUserProvisioned(s.value.userId).catch((err) => {
          console.error(`[sheet-sync] emitUserProvisioned failed for ${s.value.userId}:`, err)
        })
      } else {
        const row = batch[idx]!
        const message = s.reason instanceof Error ? s.reason.message : String(s.reason)
        result.errors.push(`Failed to create user for ${row.fullName} (${row.personalEmail}): ${message}`)
      }
    }
  }

  return result
}

async function upsertTeamMembership(userId: string, teamName: string): Promise<void> {
  // Find team by name (case-insensitive)
  let [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(ilike(teams.name, teamName))
    .limit(1)

  // Auto-create team if not found
  if (!team) {
    const [created] = await db
      .insert(teams)
      .values({ name: teamName })
      .returning({ id: teams.id })
    team = created!
  }

  // Upsert team membership — unique constraint on (teamId, userId)
  // Use onConflictDoNothing so re-runs are safe
  await db
    .insert(teamMembers)
    .values({ teamId: team.id, userId })
    .onConflictDoNothing()
}
