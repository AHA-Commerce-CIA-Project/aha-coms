import { readFile } from 'fs/promises'
import { auth as gauth, sheets } from '@googleapis/sheets'

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']

let authClient: InstanceType<typeof gauth.GoogleAuth> | null = null

async function getAuthClient() {
  if (authClient) return authClient

  const saKeyEnv = process.env.GOOGLE_SHEETS_SA_KEY
  if (!saKeyEnv) {
    throw new GoogleSheetsConfigError('GOOGLE_SHEETS_SA_KEY is not set')
  }

  let keyJson: string

  // Detect base64-encoded JSON (does not start with '{' or '/')
  if (!saKeyEnv.trimStart().startsWith('{') && !saKeyEnv.startsWith('/')) {
    keyJson = Buffer.from(saKeyEnv.trim(), 'base64').toString('utf-8')
  } else if (saKeyEnv.startsWith('/')) {
    keyJson = await readFile(saKeyEnv.trim(), 'utf-8')
  } else {
    keyJson = saKeyEnv.trim()
  }

  const credentials = JSON.parse(keyJson)

  authClient = new gauth.GoogleAuth({
    credentials,
    scopes: SCOPES,
  })

  return authClient
}

export async function readSheet(
  sheetId: string,
  tabName: string,
  range = 'A:ZZ',
): Promise<string[][]> {
  const auth = await getAuthClient()
  const client = sheets({ version: 'v4', auth })

  const fullRange = `${tabName}!${range}`

  const response = await client.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: fullRange,
    valueRenderOption: 'FORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  })

  return (response.data.values ?? []).map((row) =>
    (row as unknown[]).map((cell) => (cell == null ? '' : String(cell))),
  )
}

export async function getSheetHeaders(sheetId: string, tabName: string): Promise<string[]> {
  const rows = await readSheet(sheetId, tabName, 'A1:ZZ1')
  return rows[0] ?? []
}

export class GoogleSheetsConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GoogleSheetsConfigError'
  }
}

export class GoogleSheetsReadError extends Error {
  constructor(sheetId: string, tabName: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    super(`Failed to read sheet "${sheetId}" tab "${tabName}": ${reason}`)
    this.name = 'GoogleSheetsReadError'
    this.cause = cause
  }
}
