import { db } from '~/db'
import { identityUsers } from '~/db/schema'
import { eq } from 'drizzle-orm'
import { readPersonalEmailSheet, type SheetRow } from './sheets-client'
import { findBestMatch } from './name-matching'
import { createEmployee } from './employees'

export { normalizeName, nameTokens, matchScore } from './name-matching'

export interface MatchResult {
  matched: Array<{
    sheetName: string
    dbName: string
    email: string
    personalEmail: string
  }>
  unmatched: Array<{
    sheetName: string
    personalEmail: string
    reason: string
  }>
  created: Array<{
    sheetName: string
    personalEmail: string
    userId: string
  }>
  updated: number
  errors: string[]
}

export async function syncPersonalEmails(): Promise<MatchResult> {
  const result: MatchResult = {
    matched: [],
    unmatched: [],
    created: [],
    updated: 0,
    errors: [],
  }

  let sheetRows: SheetRow[]
  try {
    sheetRows = await readPersonalEmailSheet()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    result.errors.push(`Failed to read Google Sheet: ${message}`)
    return result
  }

  if (sheetRows.length === 0) {
    result.errors.push('No rows with valid personal emails found in the sheet')
    return result
  }

  const employees = await db
    .select({ id: identityUsers.id, name: identityUsers.name, email: identityUsers.email })
    .from(identityUsers)
    .where(eq(identityUsers.status, 'active'))

  const toUpdate: Array<{ row: SheetRow; match: (typeof employees)[number] }> = []
  const toCreate: SheetRow[] = []

  for (const row of sheetRows) {
    const { match, score, ambiguous } = findBestMatch(row.fullName, employees)

    if (ambiguous) {
      result.unmatched.push({
        sheetName: row.fullName,
        personalEmail: row.personalEmail,
        reason: 'Multiple employees match — needs manual review',
      })
      continue
    }

    if (!match || score === 0) {
      toCreate.push(row)
      continue
    }

    toUpdate.push({ row, match })
  }

  // Batch create non-workspace users (concurrency 5, mirrors CSV import pattern)
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
      } else {
        const row = batch[idx]!
        const message = s.reason instanceof Error ? s.reason.message : String(s.reason)
        result.errors.push(`Failed to create user for ${row.fullName} (${row.personalEmail}): ${message}`)
      }
    }
  }

  for (const { row, match } of toUpdate) {
    result.matched.push({
      sheetName: row.fullName,
      dbName: match.name,
      email: match.email,
      personalEmail: row.personalEmail,
    })

    try {
      await db
        .update(identityUsers)
        .set({ personalEmail: row.personalEmail, updatedAt: new Date() })
        .where(eq(identityUsers.id, match.id))

      result.updated++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push(`Failed to update ${match.email}: ${message}`)
    }
  }

  return result
}
