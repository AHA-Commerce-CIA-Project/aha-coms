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
const CSV_IMPORT_CREATE_CONCURRENCY = 5

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

type ImportAccumulator = {
  preview: EmployeeCsvImportResult['preview']
  created: EmployeeCsvImportResult['created']
  skipped: EmployeeCsvImportResult['skipped']
  flagged: EmployeeCsvImportResult['flagged']
  errors: EmployeeCsvImportResult['errors']
}

type CollisionContext = {
  existingEmails: Set<string>
  collisionByEmail: Map<string, string>
  collisionUserNameById: Map<string, string>
  nonWorkspaceUsers: Array<{ id: string; name: string }>
}

type CsvImportDeps = {
  db: typeof import('~/db')['db']
  identityUsers: typeof import('~/db/schema')['identityUsers']
  identityUserEmails: typeof import('~/db/schema')['identityUserEmails']
  createEmployee: typeof import('./employees')['createEmployee']
  emitUserProvisioned: typeof import('./provisioning-events')['emitUserProvisioned']
}

async function loadCsvImportDeps(): Promise<CsvImportDeps> {
  const [{ db }, { identityUsers, identityUserEmails }, { createEmployee }, { emitUserProvisioned }] =
    await Promise.all([
      import('~/db'),
      import('~/db/schema'),
      import('./employees'),
      import('./provisioning-events'),
    ])
  return { db, identityUsers, identityUserEmails, createEmployee, emitUserProvisioned }
}

/**
 * Build the collision-detection lookup tables for a CSV import.
 *
 * PR D Spec 06: collision detection scans BOTH workspace and personal emails
 * (the CSV may now carry an optional Personal Email column). Rows where any
 * candidate address already exists go to flagged[] (not skipped[]) carrying
 * collisionUserId + collisionUserName so the admin can resolve the conflict.
 */
async function loadCollisionContext(
  rows: ParsedGoogleAdminUserRow[],
  deps: CsvImportDeps,
): Promise<CollisionContext> {
  const { db, identityUsers, identityUserEmails } = deps

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
    db
      .select({ id: identityUsers.id, name: identityUsers.name })
      .from(identityUsers)
      .where(eq(identityUsers.hasGoogleWorkspace, false)),
  ])

  const collisionByEmail = new Map<string, string>()
  for (const r of existingEmailRows) collisionByEmail.set(r.emailNormalized, r.identityUserId)

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

  return { existingEmails, collisionByEmail, collisionUserNameById, nonWorkspaceUsers }
}

/**
 * Determine which (if any) candidate email on this row already exists in the
 * registry. Workspace takes precedence over personal — matches the original
 * priority ordering before the refactor.
 */
function findCollidingEmail(
  row: ParsedGoogleAdminUserRow,
  existingEmails: Set<string>,
): string | null {
  const workspaceNorm = row.email.toLowerCase().trim()
  if (existingEmails.has(workspaceNorm)) return workspaceNorm

  const personalNorm = row.personalEmail?.toLowerCase().trim() ?? ''
  if (personalNorm && existingEmails.has(personalNorm)) return personalNorm

  return null
}

function pushEmailCollision(
  row: ParsedGoogleAdminUserRow,
  collidingEmail: string,
  ctx: CollisionContext,
  acc: ImportAccumulator,
): void {
  const collisionUserId = ctx.collisionByEmail.get(collidingEmail) ?? ''
  const collisionUserName = ctx.collisionUserNameById.get(collisionUserId) ?? '(unknown)'
  acc.flagged.push({
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
}

async function pushNameCollision(
  row: ParsedGoogleAdminUserRow,
  nwMatch: { id: string; name: string } | null | undefined,
  nwAmbiguous: boolean,
  acc: ImportAccumulator,
): Promise<void> {
  const matchedEmail = nwAmbiguous
    ? '(ambiguous)'
    : await getDisplayEmail(nwMatch!.id).then((e) => e ?? '(no email)')
  acc.flagged.push({
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
}

function pushSkipReasonForRow(
  row: ParsedGoogleAdminUserRow,
  acc: ImportAccumulator,
): boolean {
  if (!row.email) {
    acc.skipped.push({ rowNumber: row.rowNumber, reason: 'Missing email address' })
    return true
  }
  if (!row.fullName) {
    acc.skipped.push({ rowNumber: row.rowNumber, email: row.email, reason: 'Missing full name' })
    return true
  }
  if (row.status.toLowerCase() !== 'active') {
    acc.skipped.push({
      rowNumber: row.rowNumber,
      email: row.email,
      reason: `Skipped status ${row.status || 'unknown'}`,
    })
    return true
  }
  return false
}

/**
 * Classify a single row into skipped / flagged / preview / pending. Mutates
 * the passed accumulator and pushes pending rows to the supplied list when
 * mode === 'commit' and no collision is detected.
 */
async function classifyImportRow(
  row: ParsedGoogleAdminUserRow,
  ctx: CollisionContext,
  mode: 'preview' | 'commit',
  acc: ImportAccumulator,
  pendingRows: ParsedGoogleAdminUserRow[],
): Promise<void> {
  if (pushSkipReasonForRow(row, acc)) return

  const collidingEmail = findCollidingEmail(row, ctx.existingEmails)
  if (collidingEmail) {
    pushEmailCollision(row, collidingEmail, ctx, acc)
    return
  }

  const { match: nwMatch, score: nwScore, ambiguous: nwAmbiguous } = findBestMatch(
    row.fullName,
    ctx.nonWorkspaceUsers,
  )
  if (nwScore > 0) {
    await pushNameCollision(row, nwMatch, nwAmbiguous, acc)
    return
  }

  if (mode === 'preview') {
    acc.preview.push({
      rowNumber: row.rowNumber,
      email: row.email,
      name: row.fullName,
    })
    return
  }

  pendingRows.push(row)
}

async function createImportedEmployees(
  pendingRows: ParsedGoogleAdminUserRow[],
  ctx: CollisionContext,
  acc: ImportAccumulator,
  deps: CsvImportDeps,
): Promise<void> {
  const { createEmployee } = deps

  for (let i = 0; i < pendingRows.length; i += CSV_IMPORT_CREATE_CONCURRENCY) {
    const batch = pendingRows.slice(i, i + CSV_IMPORT_CREATE_CONCURRENCY)
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

    for (const [idx, settled] of results.entries()) {
      if (settled.status === 'fulfilled') {
        const { row, result } = settled.value
        ctx.existingEmails.add(row.email)
        acc.created.push({
          rowNumber: row.rowNumber,
          id: result.id,
          email: row.email,
          name: row.fullName,
        })
        if (result.provisioningStatus === 'failed') {
          acc.errors.push({
            rowNumber: row.rowNumber,
            email: row.email,
            message: `Employee created but provisioning failed: ${result.provisioningError ?? 'Unknown provisioning error'}`,
          })
        }
      } else {
        const row = batch[idx]!
        const error = settled.reason
        acc.errors.push({
          rowNumber: row.rowNumber,
          email: row.email,
          message: error instanceof Error ? error.message : 'Unknown import error',
        })
      }
    }
  }
}

function emitProvisionedEvents(
  acc: ImportAccumulator,
  emitUserProvisioned: CsvImportDeps['emitUserProvisioned'],
): void {
  if (acc.created.length === 0) return
  Promise.all(
    acc.created.map((c) =>
      emitUserProvisioned(c.id).catch((err) => {
        logger.error({ err, userId: c.id }, '[provisioning-events] emitUserProvisioned failed')
      }),
    ),
  ).catch(() => {})
}

export async function importEmployeesFromGoogleAdminCsv(
  csv: string,
  options?: { preview?: boolean },
): Promise<EmployeeCsvImportResult> {
  const deps = await loadCsvImportDeps()

  const mode = options?.preview ? 'preview' : 'commit'
  const rows = parseGoogleAdminUsersCsv(csv)

  const acc: ImportAccumulator = {
    preview: [],
    created: [],
    skipped: [],
    flagged: [],
    errors: [],
  }

  const ctx = await loadCollisionContext(rows, deps)
  const pendingRows: ParsedGoogleAdminUserRow[] = []

  for (const row of rows) {
    await classifyImportRow(row, ctx, mode, acc, pendingRows)
  }

  await createImportedEmployees(pendingRows, ctx, acc, deps)
  emitProvisionedEvents(acc, deps.emitUserProvisioned)

  return {
    mode,
    parsedCount: rows.length,
    previewCount: acc.preview.length,
    createdCount: acc.created.length,
    skippedCount: acc.skipped.length,
    flaggedCount: acc.flagged.length,
    errorCount: acc.errors.length,
    preview: acc.preview,
    created: acc.created,
    skipped: acc.skipped,
    flagged: acc.flagged,
    errors: acc.errors,
  }
}
