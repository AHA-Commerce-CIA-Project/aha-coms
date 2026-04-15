import { db } from '~/db'
import { identityUsers } from '~/db/schema'
import { eq } from 'drizzle-orm'
import { readPersonalEmailSheet, type SheetRow } from './sheets-client'

interface MatchResult {
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
  updated: number
  errors: string[]
}

/**
 * Normalize a name for comparison:
 * - lowercase
 * - strip periods (middle initials like "A." become "A")
 * - collapse whitespace
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extract first and last tokens from a name.
 * "Adiella Aisy Oktaviani" → { first: "adiella", last: "oktaviani" }
 * "Adiella A. Oktaviani"   → { first: "adiella", last: "oktaviani" }
 */
function nameTokens(name: string): { first: string; last: string; full: string } {
  const normalized = normalizeName(name)
  const parts = normalized.split(' ')
  return {
    first: parts[0] ?? '',
    last: parts.length > 1 ? parts[parts.length - 1]! : '',
    full: normalized,
  }
}

/**
 * Match a sheet name against a DB name using first+last name strategy.
 * Returns a confidence score: 0 = no match, 1 = first+last match, 2 = full match
 */
function matchScore(sheetName: string, dbName: string): number {
  const sheet = nameTokens(sheetName)
  const dbTokens = nameTokens(dbName)

  // Exact full match (after normalization)
  if (sheet.full === dbTokens.full) return 2

  // First + last name match
  if (sheet.first === dbTokens.first && sheet.last === dbTokens.last) return 1

  // Single-name entry: "Pauzi" (sheet) → "Pauzi (AHA)" or "Muliyadin AHA" (DB)
  // Match on first name only when the sheet has a single word
  if (!sheet.last && sheet.first === dbTokens.first) return 1

  return 0
}

export async function syncPersonalEmails(): Promise<MatchResult> {
  const result: MatchResult = {
    matched: [],
    unmatched: [],
    updated: 0,
    errors: [],
  }

  // 1. Fetch sheet data
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

  // 2. Fetch all active employees from DB
  const employees = await db
    .select({ id: identityUsers.id, name: identityUsers.name, email: identityUsers.email })
    .from(identityUsers)
    .where(eq(identityUsers.status, 'active'))

  // 3. Match each sheet row to an employee
  for (const row of sheetRows) {
    let bestMatch: (typeof employees)[number] | null = null
    let bestScore = 0
    let ambiguous = false

    for (const emp of employees) {
      const score = matchScore(row.fullName, emp.name)
      if (score > bestScore) {
        bestScore = score
        bestMatch = emp
        ambiguous = false
      } else if (score === bestScore && score > 0 && emp.id !== bestMatch?.id) {
        ambiguous = true
      }
    }

    if (!bestMatch || bestScore === 0) {
      result.unmatched.push({
        sheetName: row.fullName,
        personalEmail: row.personalEmail,
        reason: 'No matching employee found',
      })
      continue
    }

    if (ambiguous) {
      result.unmatched.push({
        sheetName: row.fullName,
        personalEmail: row.personalEmail,
        reason: 'Multiple employees match — needs manual review',
      })
      continue
    }

    result.matched.push({
      sheetName: row.fullName,
      dbName: bestMatch.name,
      email: bestMatch.email,
      personalEmail: row.personalEmail,
    })

    // 4. Update the personal email in DB
    try {
      await db
        .update(identityUsers)
        .set({ personalEmail: row.personalEmail, updatedAt: new Date() })
        .where(eq(identityUsers.id, bestMatch.id))

      result.updated++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push(`Failed to update ${bestMatch.email}: ${message}`)
    }
  }

  return result
}
