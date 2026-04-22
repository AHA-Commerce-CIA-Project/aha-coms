import { sheets } from '@googleapis/sheets'
import { JWT } from 'google-auth-library'
import { readFileSync } from 'fs'

export interface SheetRow {
  fullName: string
  personalEmail: string
}

function buildSheetsAuth() {
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS

  if (!keyFile) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS environment variable is not set')
  }

  const key = JSON.parse(readFileSync(keyFile, 'utf-8'))

  // No `subject` needed — Sheets API doesn't require DWD,
  // just share the sheet with the service account email
  return new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

export async function readPersonalEmailSheet(): Promise<SheetRow[]> {
  const spreadsheetId = process.env.SHEETS_PERSONAL_EMAIL_ID
  const sheetName = process.env.SHEETS_PERSONAL_EMAIL_TAB ?? 'HEROES - Fulltime Staff'

  if (!spreadsheetId) {
    throw new Error('SHEETS_PERSONAL_EMAIL_ID environment variable is not set')
  }

  const auth = buildSheetsAuth()
  const sheetsClient = sheets({ version: 'v4', auth })

  // Column A = full name, Column C = personal email
  const range = `'${sheetName}'!A:C`

  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range,
  })

  const rows = response.data.values
  if (!rows || rows.length === 0) {
    return []
  }

  const results: SheetRow[] = []

  // Skip header row (index 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const fullName = (row[0] ?? '').toString().trim()
    const personalEmail = (row[2] ?? '').toString().trim() // Column C = index 2

    if (fullName && personalEmail && personalEmail.includes('@')) {
      results.push({ fullName, personalEmail })
    }
  }

  return results
}

export interface EmployeeInfoSheetRow {
  fullName: string
  personalEmail: string
  phone: string        // WA column
  mobilePhone: string  // HP column
  birthDate: string    // Tanggal Lahir — raw string from sheet
  teamName: string     // Tim
  position: string     // Jabatan
  leaderName: string   // Penilai/Leader
}

export async function readEmployeeInfoSheet(): Promise<EmployeeInfoSheetRow[]> {
  const spreadsheetId = process.env.SHEETS_PERSONAL_EMAIL_ID
  const sheetName = process.env.SHEETS_PERSONAL_EMAIL_TAB ?? 'HEROES - Fulltime Staff'

  if (!spreadsheetId) {
    throw new Error('SHEETS_PERSONAL_EMAIL_ID environment variable is not set')
  }

  const auth = buildSheetsAuth()
  const sheetsClient = sheets({ version: 'v4', auth })

  // Read entire sheet — we'll match by header name
  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A1:Z`,
  })

  const rows = response.data.values
  if (!rows || rows.length === 0) return []

  // Build header map from row 0
  const header = rows[0]!
  const col = (name: string) => header.findIndex((h: string) => h.trim() === name)

  const iNama = col('Nama Lengkap')
  const iEmail = col('Email')
  const iWA = col('WA')
  const iHP = col('HP')
  const iTanggalLahir = col('Tanggal Lahir')
  const iTim = col('Tim')
  const iJabatan = col('Jabatan')
  const iPenilai = col('Penilai/Leader')

  if (iNama === -1) throw new Error('Required column "Nama Lengkap" not found in sheet header')

  const results: EmployeeInfoSheetRow[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!
    const get = (idx: number) => (idx === -1 ? '' : (row[idx] ?? '').toString().trim())

    const fullName = get(iNama)
    if (!fullName) continue

    results.push({
      fullName,
      personalEmail: get(iEmail),
      phone: get(iWA),
      mobilePhone: get(iHP),
      birthDate: get(iTanggalLahir),
      teamName: get(iTim),
      position: get(iJabatan),
      leaderName: get(iPenilai),
    })
  }

  return results
}
