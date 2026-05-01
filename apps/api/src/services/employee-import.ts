import { inArray, eq } from 'drizzle-orm'
import { findBestMatch } from './name-matching'
import { logger } from '~/logger'
import { getDisplayEmail } from './email-resolution'

export interface ParsedGoogleAdminUserRow {
  rowNumber: number
  firstName: string
  lastName: string
  fullName: string
  email: string
  /** Optional Personal Email column (PR D Spec 06). Empty string when absent. */
  personalEmail: string
  status: string
  department?: string
  position?: string
  phone?: string
}

export interface EmployeeCsvImportResult {
  mode: 'preview' | 'commit'
  parsedCount: number
  previewCount: number
  createdCount: number
  skippedCount: number
  flaggedCount: number
  errorCount: number
  preview: Array<{ rowNumber: number; email: string; name: string }>
  created: Array<{ rowNumber: number; id: string; email: string; name: string }>
  skipped: Array<{ rowNumber: number; email?: string; reason: string }>
  flagged: Array<{
    rowNumber: number
    /** @deprecated Use csvWorkspaceEmail. Kept for back-compat with consumers from PR A. */
    csvEmail: string
    csvWorkspaceEmail?: string
    csvPersonalEmail?: string
    csvName: string
    csvDepartment?: string
    csvPosition?: string
    csvPhone?: string
    /** Discriminates between an email-collision row and a name-collision row. */
    collisionKind: 'email_collision' | 'name_collision'
    /** PR D — populated for email_collision rows. The exact address that already exists. */
    collisionEmail?: string
    /** PR D — populated for email_collision rows. Identity user id of the colliding row owner. */
    collisionUserId?: string
    /** PR D — populated for email_collision rows. Display name of the colliding row owner. */
    collisionUserName?: string
    /** Populated for name_collision rows (existing PR A behaviour). */
    existingId: string
    existingName: string
    existingEmail: string
  }>
  errors: Array<{ rowNumber: number; email?: string; message: string }>
}

export const MAX_EMPLOYEE_IMPORT_CSV_BYTES = 2 * 1024 * 1024

const HEADER_KEYS = {
  firstName: 'first name [required]',
  lastName: 'last name [required]',
  email: 'email address [required]',
  status: 'status [read only]',
  department: 'department',
  position: 'employee title',
  workPhone: 'work phone',
  mobilePhone: 'mobile phone',
  /** PR D Spec 06 — optional column. When present, captured as the row's personal email candidate. */
  personalEmail: 'personal email',
} as const

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase()
}

export function assertEmployeeImportCsvSize(csv: string): void {
  const bytes = Buffer.byteLength(csv, 'utf8')
  if (bytes > MAX_EMPLOYEE_IMPORT_CSV_BYTES) {
    throw new Error(`CSV file is too large. Maximum size is ${Math.floor(MAX_EMPLOYEE_IMPORT_CSV_BYTES / (1024 * 1024))}MB`)
  }
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const input = csv.replace(/^﻿/, '')

  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    const next = input[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++
      row.push(cell)
      const normalizedRow = row.map((value) => value.trim())
      if (normalizedRow.some((value) => value !== '')) {
        rows.push(normalizedRow)
      }
      row = []
      cell = ''
      continue
    }

    cell += char
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    const normalizedRow = row.map((value) => value.trim())
    if (normalizedRow.some((value) => value !== '')) {
      rows.push(normalizedRow)
    }
  }

  return rows
}

export function parseGoogleAdminUsersCsv(csv: string): ParsedGoogleAdminUserRow[] {
  assertEmployeeImportCsvSize(csv)

  const records = parseCsv(csv)
  if (records.length === 0) {
    throw new Error('CSV file is empty')
  }

  const header = records[0]!
  const headerMap = new Map(header.map((value, index) => [normalizeHeader(value), index]))

  for (const requiredKey of [
    HEADER_KEYS.firstName,
    HEADER_KEYS.lastName,
    HEADER_KEYS.email,
    HEADER_KEYS.status,
  ]) {
    if (!headerMap.has(requiredKey)) {
      throw new Error(`CSV header "${requiredKey}" was not found`)
    }
  }

  const getValue = (row: string[], key: string) => {
    const index = headerMap.get(key)
    return index == null ? '' : (row[index] ?? '').trim()
  }

  return records.slice(1).map((row, index) => {
    const firstName = getValue(row, HEADER_KEYS.firstName)
    const lastName = getValue(row, HEADER_KEYS.lastName)
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
    return {
      rowNumber: index + 2,
      firstName,
      lastName,
      fullName,
      email: getValue(row, HEADER_KEYS.email).toLowerCase(),
      personalEmail: getValue(row, HEADER_KEYS.personalEmail).toLowerCase(),
      status: getValue(row, HEADER_KEYS.status),
      department: getValue(row, HEADER_KEYS.department) || undefined,
      position: getValue(row, HEADER_KEYS.position) || undefined,
      phone: getValue(row, HEADER_KEYS.workPhone) || getValue(row, HEADER_KEYS.mobilePhone) || undefined,
    }
  })
}

export async function importEmployeesFromGoogleAdminCsv(
  csv: string,
  options?: { preview?: boolean },
): Promise<EmployeeCsvImportResult> {
  const [{ db }, { identityUsers, identityUserEmails }, { createEmployee }, { emitUserProvisioned }] =
    await Promise.all([
      import('~/db'),
      import('~/db/schema'),
      import('./employees'),
      import('./provisioning-events'),
    ])

  const mode = options?.preview ? 'preview' : 'commit'
  const rows = parseGoogleAdminUsersCsv(csv)
  const preview: EmployeeCsvImportResult['preview'] = []
  const created: EmployeeCsvImportResult['created'] = []
  const skipped: EmployeeCsvImportResult['skipped'] = []
  const flagged: EmployeeCsvImportResult['flagged'] = []
  const errors: EmployeeCsvImportResult['errors'] = []

  // PR D Spec 06: collision detection now scans BOTH workspace and personal emails
  // (the CSV may now carry an optional Personal Email column). Rows where any
  // candidate address already exists go to flagged[] (not skipped[]) carrying
  // collisionUserId and collisionUserName so the admin can resolve the conflict.
  const validRows = rows.filter((row) => row.email)
  const allCandidateEmails = [
    ...validRows.map((row) => row.email.toLowerCase().trim()),
    ...validRows
      .map((row) => row.personalEmail?.toLowerCase().trim())
      .filter((e): e is string => !!e),
  ]
  const uniqueEmailsNormalized = [...new Set(allCandidateEmails)]
  const [existingEmailRows, nonWorkspaceUsers] = await Promise.all([
    uniqueEmailsNormalized.length
      ? db
          .select({
            emailNormalized: identityUserEmails.emailNormalized,
            identityUserId: identityUserEmails.identityUserId,
          })
          .from(identityUserEmails)
          .where(inArray(identityUserEmails.emailNormalized, uniqueEmailsNormalized))
      : Promise.resolve([]),
    // For name-collision flagging: load non-workspace users with their display email.
    // We fetch id+name here; email is resolved lazily per matched row below.
    db
      .select({ id: identityUsers.id, name: identityUsers.name })
      .from(identityUsers)
      .where(eq(identityUsers.hasGoogleWorkspace, false)),
  ])

  // emailNormalized → identityUserId map for resolving collision target user
  const collisionByEmail = new Map<string, string>()
  for (const r of existingEmailRows) collisionByEmail.set(r.emailNormalized, r.identityUserId)
  // identityUserId → display name (look up once per affected user)
  const collisionUserIds = [...new Set([...collisionByEmail.values()])]
  let collisionUserNameById = new Map<string, string>()
  if (collisionUserIds.length > 0) {
    const userRows = await db
      .select({ id: identityUsers.id, name: identityUsers.name })
      .from(identityUsers)
      .where(inArray(identityUsers.id, collisionUserIds))
    collisionUserNameById = new Map(userRows.map((u) => [u.id, u.name]))
  }
  const existingEmails = new Set(existingEmailRows.map((r) => r.emailNormalized))

  const pendingRows: ParsedGoogleAdminUserRow[] = []

  for (const row of rows) {
    if (!row.email) {
      skipped.push({ rowNumber: row.rowNumber, reason: 'Missing email address' })
      continue
    }

    if (!row.fullName) {
      skipped.push({ rowNumber: row.rowNumber, email: row.email, reason: 'Missing full name' })
      continue
    }

    if (row.status.toLowerCase() !== 'active') {
      skipped.push({ rowNumber: row.rowNumber, email: row.email, reason: `Skipped status ${row.status || 'unknown'}` })
      continue
    }

    const workspaceNorm = row.email.toLowerCase().trim()
    const personalNorm = row.personalEmail?.toLowerCase().trim() ?? ''

    // PR D: email collision flagging — surface the conflicting target user so the
    // admin can decide whether to merge identities, change the address, or skip.
    const collidingEmail = existingEmails.has(workspaceNorm)
      ? workspaceNorm
      : personalNorm && existingEmails.has(personalNorm)
        ? personalNorm
        : null
    if (collidingEmail) {
      const collisionUserId = collisionByEmail.get(collidingEmail) ?? ''
      const collisionUserName = collisionUserNameById.get(collisionUserId) ?? '(unknown)'
      flagged.push({
        rowNumber: row.rowNumber,
        csvEmail: row.email,
        csvWorkspaceEmail: row.email,
        csvPersonalEmail: row.personalEmail || undefined,
        csvName: row.fullName,
        csvDepartment: row.department,
        csvPosition: row.position,
        csvPhone: row.phone,
        collisionKind: 'email_collision',
        collisionEmail: collidingEmail,
        collisionUserId,
        collisionUserName,
        existingId: collisionUserId,
        existingName: collisionUserName,
        existingEmail: collidingEmail,
      })
      continue
    }

    const { match: nwMatch, score: nwScore, ambiguous: nwAmbiguous } = findBestMatch(row.fullName, nonWorkspaceUsers)
    if (nwScore > 0) {
      // Resolve display email for the matched non-workspace user
      const matchedEmail = nwAmbiguous ? '(ambiguous)' : await getDisplayEmail(nwMatch!.id).then((e) => e ?? '(no email)')
      flagged.push({
        rowNumber: row.rowNumber,
        csvEmail: row.email,
        csvWorkspaceEmail: row.email,
        csvPersonalEmail: row.personalEmail || undefined,
        csvName: row.fullName,
        csvDepartment: row.department,
        csvPosition: row.position,
        csvPhone: row.phone,
        collisionKind: 'name_collision',
        existingId: nwAmbiguous ? '' : nwMatch!.id,
        existingName: nwAmbiguous ? '(multiple matches)' : nwMatch!.name,
        existingEmail: matchedEmail,
      })
      continue
    }

    if (mode === 'preview') {
      preview.push({
        rowNumber: row.rowNumber,
        email: row.email,
        name: row.fullName,
      })
      continue
    }

    pendingRows.push(row)
  }

  const CONCURRENCY = 5
  for (let i = 0; i < pendingRows.length; i += CONCURRENCY) {
    const batch = pendingRows.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      batch.map(async (row) => {
        const result = await createEmployee({
          workspaceEmail: row.email,
          personalEmail: row.personalEmail || undefined,
          name: row.fullName,
          phone: row.phone,
          department: row.department,
          position: row.position,
          portalRole: 'employee',
          hasGoogleWorkspace: true,
          source: 'csv_import',
          addedBy: 'csv_import',
        })
        return { row, result }
      }),
    )

    for (const settled of results) {
      if (settled.status === 'fulfilled') {
        const { row, result } = settled.value
        existingEmails.add(row.email)
        created.push({
          rowNumber: row.rowNumber,
          id: result.id,
          email: row.email,
          name: row.fullName,
        })
        if (result.provisioningStatus === 'failed') {
          errors.push({
            rowNumber: row.rowNumber,
            email: row.email,
            message: `Employee created but provisioning failed: ${result.provisioningError ?? 'Unknown provisioning error'}`,
          })
        }
      } else {
        const row = batch[results.indexOf(settled)]!
        const error = settled.reason
        errors.push({
          rowNumber: row.rowNumber,
          email: row.email,
          message: error instanceof Error ? error.message : 'Unknown import error',
        })
      }
    }
  }

  if (created.length > 0) {
    Promise.all(
      created.map((c) =>
        emitUserProvisioned(c.id).catch((err) => {
          logger.error({ err, userId: c.id }, '[provisioning-events] emitUserProvisioned failed')
        }),
      ),
    ).catch(() => {})
  }

  return {
    mode,
    parsedCount: rows.length,
    previewCount: preview.length,
    createdCount: created.length,
    skippedCount: skipped.length,
    flaggedCount: flagged.length,
    errorCount: errors.length,
    preview,
    created,
    skipped,
    flagged,
    errors,
  }
}
