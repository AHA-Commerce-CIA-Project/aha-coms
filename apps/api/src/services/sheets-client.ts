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
