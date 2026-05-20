import { db } from '~/db'
import { identityUsers, teams, teamMembers, identityUserEmails } from '~/db/schema'
import { eq, ilike } from 'drizzle-orm'
import { readEmployeeInfoSheet, type EmployeeInfoSheetRow } from './sheets-client'
import { findBestMatch } from './name-matching'
import { emitUserProvisioned } from './provisioning-events'
import { getDisplayEmailsForUsers } from './email-resolution'
import { logger } from '~/logger'

export interface EmployeeInfoSyncResult {
  updated: number
  created: Array<{ sheetName: string; personalEmail: string; userId: string }>
  matched: Array<{ sheetName: string; dbName: string; email: string }>
  unmatched: Array<{ sheetName: string; reason: string }>
  errors: string[]
}

const SYNC_CREATE_CONCURRENCY = 5

type EmployeeMatchCandidate = { id: string; name: string }

function buildIdentityUserDelta(
  row: EmployeeInfoSheetRow,
): Partial<typeof identityUsers.$inferInsert> {
  const fields: Partial<typeof identityUsers.$inferInsert> = { updatedAt: new Date() }
  if (row.phone) fields.phone = row.phone
  if (row.birthDate) fields.birthDate = row.birthDate
  if (row.position) fields.position = row.position
  if (row.leaderName) fields.leaderName = row.leaderName
  return fields
}

/**
 * Upsert a personal email from a sheet row. addedBy='sheet_sync',
 * verifiedAt=NOW() per Q4b trust-on-entry semantics. Skips silently if the
 * address already exists anywhere (global unique constraint). isPrimary is
 * true only if the user currently has no email rows.
 */
async function upsertPersonalEmailFromSheet(
  userId: string,
  personalEmail: string,
): Promise<void> {
  const emailNorm = personalEmail.toLowerCase().trim()

  const existing = await db
    .select({ id: identityUserEmails.id })
    .from(identityUserEmails)
    .where(eq(identityUserEmails.emailNormalized, emailNorm))
    .limit(1)
  if (existing.length > 0) return

  const userPersonalRows = await db
    .select({ id: identityUserEmails.id })
    .from(identityUserEmails)
    .where(eq(identityUserEmails.identityUserId, userId))
    .limit(1)

  await db
    .insert(identityUserEmails)
    .values({
      identityUserId: userId,
      email: personalEmail,
      emailNormalized: emailNorm,
      kind: 'personal',
      isPrimary: userPersonalRows.length === 0,
      verifiedAt: new Date(),
      addedBy: 'sheet_sync',
    })
    .onConflictDoNothing()
}

async function applyMatchedSyncRow(
  row: EmployeeInfoSheetRow,
  match: EmployeeMatchCandidate,
  result: EmployeeInfoSyncResult,
  emailMap: Map<string, string | null>,
): Promise<void> {
  await db
    .update(identityUsers)
    .set(buildIdentityUserDelta(row))
    .where(eq(identityUsers.id, match.id))

  if (row.personalEmail) {
    await upsertPersonalEmailFromSheet(match.id, row.personalEmail)
  }

  if (row.teamName) {
    await upsertTeamMembership(match.id, row.teamName)
  }

  // Display email resolved from the pre-fetched batch map — no per-row query (T1.6)
  const displayEmail = emailMap.get(match.id) ?? null
  result.matched.push({
    sheetName: row.fullName,
    dbName: match.name,
    email: displayEmail ?? '(no email)',
  })
  result.updated++
}

async function processSyncRowWithMatch(
  row: EmployeeInfoSheetRow,
  matchResult: ReturnType<typeof findBestMatch>,
  result: EmployeeInfoSyncResult,
  toCreate: EmployeeInfoSheetRow[],
  emailMap: Map<string, string | null>,
): Promise<void> {
  const { match, score, ambiguous } = matchResult

  if (ambiguous) {
    result.unmatched.push({
      sheetName: row.fullName,
      reason: 'Multiple employees match — needs manual review',
    })
    return
  }

  if (!match || score === 0) {
    if (row.personalEmail) {
      toCreate.push(row)
    } else {
      result.unmatched.push({
        sheetName: row.fullName,
        reason: 'No matching employee found',
      })
    }
    return
  }

  try {
    await applyMatchedSyncRow(row, match, result, emailMap)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    result.errors.push(`Failed to update ${match.name}: ${message}`)
  }
}

async function createEmployeesFromSheetRows(
  toCreate: EmployeeInfoSheetRow[],
  result: EmployeeInfoSyncResult,
): Promise<void> {
  // Dynamic import preserved to avoid a future circular dep with ./employees.
  const { createEmployee } = await import('./employees')

  for (let i = 0; i < toCreate.length; i += SYNC_CREATE_CONCURRENCY) {
    const batch = toCreate.slice(i, i + SYNC_CREATE_CONCURRENCY)
    const settled = await Promise.allSettled(
      batch.map((row) =>
        createEmployee({
          personalEmail: row.personalEmail,
          name: row.fullName,
          hasGoogleWorkspace: false,
          source: 'sheet_sync',
          addedBy: 'sheet_sync',
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
          logger.error(
            { err, userId: s.value.userId },
            '[sheet-sync] emitUserProvisioned failed',
          )
        })
      } else {
        const row = batch[idx]!
        const message = s.reason instanceof Error ? s.reason.message : String(s.reason)
        result.errors.push(
          `Failed to create user for ${row.fullName} (${row.personalEmail}): ${message}`,
        )
      }
    }
  }
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
    .select({ id: identityUsers.id, name: identityUsers.name })
    .from(identityUsers)
    .where(eq(identityUsers.status, 'active'))

  // Match all rows upfront (single pass) so we can batch-fetch all display emails in one
  // query instead of one per matched row (T1.6 — N+1 + duplicate query fix).
  type MatchResult = ReturnType<typeof findBestMatch>
  const rowMatches: MatchResult[] = sheetRows.map((row) => findBestMatch(row.fullName, employees))

  const matchedUserIds = new Set<string>()
  for (const { match, score, ambiguous } of rowMatches) {
    if (!ambiguous && match && score > 0) {
      matchedUserIds.add(match.id)
    }
  }
  const emailMap = await getDisplayEmailsForUsers([...matchedUserIds])

  const toCreate: EmployeeInfoSheetRow[] = []

  for (let i = 0; i < sheetRows.length; i++) {
    await processSyncRowWithMatch(sheetRows[i], rowMatches[i], result, toCreate, emailMap)
  }

  await createEmployeesFromSheetRows(toCreate, result)

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
