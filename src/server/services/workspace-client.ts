import { google } from 'googleapis'
import { readFileSync } from 'fs'

export interface WorkspaceUser {
  primaryEmail: string
  name: {
    fullName: string
    givenName: string
    familyName: string
  }
  suspended: boolean
  archived: boolean
  orgUnitPath: string
  department?: string
  title?: string
  phones?: Array<{ value: string; type: string }>
  isAdmin: boolean
  creationTime: string
  lastLoginTime: string
}

function buildAuth() {
  const adminEmail = process.env.WORKSPACE_ADMIN_EMAIL
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS

  if (!adminEmail) {
    throw new Error('WORKSPACE_ADMIN_EMAIL environment variable is not set')
  }

  if (!keyFile) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS environment variable is not set')
  }

  const key = JSON.parse(readFileSync(keyFile, 'utf-8'))

  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/admin.directory.user.readonly'],
    subject: adminEmail,
  })
}

function mapToWorkspaceUser(raw: Record<string, unknown>): WorkspaceUser {
  const name = (raw.name ?? {}) as Record<string, unknown>
  const phones = raw.phones as Array<Record<string, unknown>> | undefined
  const organizations = raw.organizations as Array<Record<string, unknown>> | undefined
  const primaryOrg = organizations?.[0]

  return {
    primaryEmail: raw.primaryEmail as string,
    name: {
      fullName: (name.fullName as string) ?? '',
      givenName: (name.givenName as string) ?? '',
      familyName: (name.familyName as string) ?? '',
    },
    suspended: (raw.suspended as boolean) ?? false,
    archived: (raw.archived as boolean) ?? false,
    orgUnitPath: (raw.orgUnitPath as string) ?? '/',
    ...(primaryOrg?.department != null && { department: primaryOrg.department as string }),
    ...(primaryOrg?.title != null && { title: primaryOrg.title as string }),
    ...(phones != null &&
      phones.length > 0 && {
        phones: phones.map((p) => ({
          value: (p.value as string) ?? '',
          type: (p.type as string) ?? '',
        })),
      }),
    isAdmin: (raw.isAdmin as boolean) ?? false,
    creationTime: (raw.creationTime as string) ?? '',
    lastLoginTime: (raw.lastLoginTime as string) ?? '',
  }
}

export async function listAllWorkspaceUsers(): Promise<WorkspaceUser[]> {
  const customerId = process.env.WORKSPACE_CUSTOMER_ID ?? 'my_customer'

  const auth = buildAuth()
  const admin = google.admin({ version: 'directory_v1', auth })

  const users: WorkspaceUser[] = []
  let pageToken: string | undefined

  do {
    const response = await admin.users.list({
      customer: customerId,
      maxResults: 500,
      orderBy: 'email',
      ...(pageToken != null && { pageToken }),
    })

    const page = response.data

    if (page.users == null) {
      break
    }

    for (const raw of page.users) {
      users.push(mapToWorkspaceUser(raw as Record<string, unknown>))
    }

    pageToken = page.nextPageToken ?? undefined
  } while (pageToken != null)

  return users
}
