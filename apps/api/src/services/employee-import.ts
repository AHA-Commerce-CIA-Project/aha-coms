import { inArray, eq } from 'drizzle-orm'
import { findBestMatch } from './name-matching'
import { logger } from '~/logger'

export interface ParsedGoogleAdminUserRow {
  rowNumber: number
  firstName: string
  lastName: string
  fullName: string
  email: string
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
    csvEmail: string
    csvName: string
    csvDepartment?: string
    csvPosition?: string
    csvPhone?: string
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
  const [{ db }, { identityUsers }, { createEmployee }, { emitUserProvisioned }] = await Promise.all([
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

  const validRows = rows.filter((row) => row.email)
  const uniqueEmails = [...new Set(validRows.map((row) => row.email))]
  const [existingUsers, nonWorkspaceUsers] = await Promise.all([
    uniqueEmails.length
      ? db
          .select({ email: identityUsers.email })
          .from(identityUsers)
          .where(inArray(identityUsers.email, uniqueEmails))
      : Promise.resolve([]),
    db
      .select({ id: identityUsers.id, name: identityUsers.name, email: identityUsers.email })
      .from(identityUsers)
      .where(eq(identityUsers.hasGoogleWorkspace, false)),
  ])

  const existingEmails = new Set(existingUsers.map((user) => user.email.toLowerCase()))

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

    if (existingEmails.has(row.email)) {
      skipped.push({ rowNumber: row.rowNumber, email: row.email, reason: 'Employee already exists' })
      continue
    }

    const { match: nwMatch, score: nwScore, ambiguous: nwAmbiguous } = findBestMatch(row.fullName, nonWorkspaceUsers)
    if (nwScore > 0) {
      flagged.push({
        rowNumber: row.rowNumber,
        csvEmail: row.email,
        csvName: row.fullName,
        csvDepartment: row.department,
        csvPosition: row.position,
        csvPhone: row.phone,
        existingId: nwAmbiguous ? '' : nwMatch!.id,
        existingName: nwAmbiguous ? '(multiple matches)' : nwMatch!.name,
        existingEmail: nwAmbiguous ? '(ambiguous)' : nwMatch!.email,
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
          email: row.email,
          name: row.fullName,
          phone: row.phone,
          department: row.department,
          position: row.position,
          portalRole: 'employee',
          hasGoogleWorkspace: true,
          source: 'csv_import',
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
