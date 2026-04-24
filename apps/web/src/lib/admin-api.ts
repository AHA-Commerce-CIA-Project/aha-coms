import type {
  AuthTransportMode,
  PortalAdapterType,
  PortalAppRole,
  PortalComplianceStatus,
  PortalHandoffMode,
  PortalRole,
} from '@coms-portal/shared'

export interface WebhookEndpoint {
  id: string
  appId: string
  url: string
  subscribedEvents: string[]
  status: 'active' | 'disabled'
  failureCount: number
  lastDeliveredAt: string | null
  lastFailureAt: string | null
  lastFailureReason: string | null
  createdAt: string
  updatedAt: string
}

export interface WebhookEndpointWithSecret extends WebhookEndpoint {
  secret: string
}

export interface WebhookTestResult {
  delivered: boolean
  status?: number
  error?: string
}

export interface EmployeeRecord {
  id: string
  email: string
  personalEmail: string | null
  name: string
  phone: string | null
  department: string | null
  position: string | null
  branch: string | null
  portalRole: PortalRole
  status: string
  provisioningStatus: 'ready' | 'pending' | 'processing' | 'failed'
  provisioningError: string | null
  hasGoogleWorkspace: boolean
}

export interface EmployeesListResponse {
  data: EmployeeRecord[]
  total: number
  page: number
  limit: number
}

export interface CsvImportResult {
  mode: 'preview' | 'commit'
  parsedCount: number
  previewCount: number
  createdCount: number
  skippedCount: number
  errorCount: number
  flaggedCount: number
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
  preview: Array<{ rowNumber: number; email: string; name: string }>
  created: Array<{ rowNumber: number; id: string; email: string; name: string }>
  skipped: Array<{ rowNumber: number; email?: string; reason: string }>
  errors: Array<{ rowNumber: number; email?: string; message: string }>
}

export interface CreateEmployeeResult {
  id: string
  provisioningStatus: 'ready' | 'pending' | 'processing' | 'failed'
  provisioningError?: string
}

export interface TeamSummary {
  id: string
  name: string
  description: string | null
  memberCount: number
  createdAt: string
}

export interface TeamDetail {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  members: Array<{
    id: string
    userId: string
    roleInTeam: string
    name: string | null
    email: string | null
  }>
  apps: Array<{
    id: string
    appId: string
    name: string | null
    slug: string | null
  }>
}

export interface AppRecord {
  id: string
  slug: string
  name: string
  description: string | null
  url: string
  basePath: string
  iconUrl: string | null
  cloudRunService: string | null
  adapterType: PortalAdapterType
  transportMode: AuthTransportMode
  handoffMode: PortalHandoffMode
  brokerOrigin: string | null
  contractVersion: number
  complianceStatus: PortalComplianceStatus
  manifestPath: string | null
  appRoles: PortalAppRole[]
  lastVerifiedAt: string | null
  status: 'active' | 'maintenance' | 'deprecated'
  createdAt: string
  updatedAt: string
}

export interface AppDetail extends AppRecord {
  teamGrants: Array<{
    teamId: string
    teamName: string | null
  }>
}

interface ApiErrorBody {
  message?: string
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null
    throw new Error(body?.message ?? `Request failed with status ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export const adminApi = {
  searchUsers(q: string) {
    return requestJson<Array<{ id: string; name: string; email: string }>>(
      `/api/v1/employees/search?q=${encodeURIComponent(q)}`,
    )
  },
  getEmployees(params: { page: number; limit: number; search: string }) {
    const query = new URLSearchParams({
      page: String(params.page),
      limit: String(params.limit),
      search: params.search,
    })
    return requestJson<EmployeesListResponse>(`/api/v1/employees?${query.toString()}`)
  },
  getEmployee(id: string) {
    return requestJson<EmployeeRecord>(`/api/v1/employees/${id}`)
  },
  createEmployee(body: {
    email: string
    personalEmail?: string
    name: string
    phone?: string
    department?: string
    position?: string
    branch?: 'Indonesia' | 'Thailand'
    portalRole?: PortalRole
    teamId?: string
  }) {
    return requestJson<CreateEmployeeResult>(`/api/v1/employees`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  updateEmployee(id: string, body: { portalRole?: string; email?: string; hasGoogleWorkspace?: boolean }) {
    return requestJson<{ ok: true }>(`/api/v1/employees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },
  deleteEmployee(id: string) {
    return requestJson<{ ok: true }>(`/api/v1/employees/${id}`, {
      method: 'DELETE',
    })
  },
  resetEmployeePassword(id: string) {
    return requestJson<{ ok: true; email: string }>(`/api/v1/employees/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
  retryEmployeeProvisioning(id: string) {
    return requestJson<{ status: 'ready' | 'pending' | 'processing' | 'failed'; error?: string }>(
      `/api/v1/employees/${id}/retry-provisioning`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    )
  },
  batchUpdateEmployees(body: { ids: string[]; field: string; value: string }) {
    return requestJson<{ ok: true; count: number }>(`/api/v1/employees/batch-update`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  importEmployeesCsv(body: { csv: string; preview?: boolean }) {
    return requestJson<CsvImportResult>(`/api/v1/employees/import-csv`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  upgradeEmployeeWorkspace(id: string, body: {
    workspaceEmail: string
    name?: string
    department?: string
    position?: string
    phone?: string
  }) {
    return requestJson<{ ok: true }>(`/api/v1/employees/${id}/upgrade-workspace`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  getTeams() {
    return requestJson<TeamSummary[]>(`/api/v1/teams`)
  },
  getTeam(id: string) {
    return requestJson<TeamDetail>(`/api/v1/teams/${id}`)
  },
  updateTeam(id: string, body: { name?: string; description?: string }) {
    return requestJson<{ ok: true }>(`/api/v1/teams/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },
  createTeam(body: { name: string; description?: string }) {
    return requestJson<{ id: string }>(`/api/v1/teams`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  deleteTeam(id: string) {
    return requestJson<{ ok: true }>(`/api/v1/teams/${id}`, {
      method: 'DELETE',
    })
  },
  addTeamMember(id: string, body: { userId: string; roleInTeam?: string }) {
    return requestJson<{ ok: true }>(`/api/v1/teams/${id}/members`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  removeTeamMember(id: string, userId: string) {
    return requestJson<{ ok: true }>(`/api/v1/teams/${id}/members/${userId}`, {
      method: 'DELETE',
    })
  },
  grantTeamApp(id: string, body: { appId: string; appRole?: string }) {
    return requestJson<{ ok: true }>(`/api/v1/teams/${id}/apps`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  revokeTeamApp(id: string, appId: string) {
    return requestJson<{ ok: true }>(`/api/v1/teams/${id}/apps/${appId}`, {
      method: 'DELETE',
    })
  },
  getApps() {
    return requestJson<AppRecord[]>(`/api/v1/apps`)
  },
  getApp(id: string) {
    return requestJson<AppDetail>(`/api/v1/apps/${id}`)
  },
  updateApp(
    id: string,
    body: {
      name?: string
      url?: string
      basePath?: string
      adapterType?: PortalAdapterType
      transportMode?: AuthTransportMode
      handoffMode?: PortalHandoffMode
      brokerOrigin?: string
      contractVersion?: number
      complianceStatus?: PortalComplianceStatus
      manifestPath?: string
      lastVerifiedAt?: string
      status?: 'active' | 'maintenance' | 'deprecated'
    },
  ) {
    return requestJson<{ ok: true }>(`/api/v1/apps/${id}`, {
      method: 'PATCH',
    body: JSON.stringify(body),
    })
  },
  registerApp(body: {
    slug: string
    name: string
    description?: string
    url: string
    basePath: string
    iconUrl?: string
    cloudRunService?: string
    adapterType?: PortalAdapterType
    transportMode?: AuthTransportMode
    handoffMode?: PortalHandoffMode
    brokerOrigin?: string
    contractVersion?: number
    complianceStatus?: PortalComplianceStatus
    manifestPath?: string
    lastVerifiedAt?: string
    status?: 'active' | 'maintenance' | 'deprecated'
  }) {
    return requestJson<{ id: string }>(`/api/v1/apps`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  deleteApp(id: string) {
    return requestJson<{ ok: true }>(`/api/v1/apps/${id}`, {
      method: 'DELETE',
    })
  },

  // ---------------------------------------------------------------------------
  // Webhook endpoint management
  // ---------------------------------------------------------------------------

  listWebhooks(appId: string) {
    return requestJson<WebhookEndpoint[]>(`/api/v1/apps/${appId}/webhooks`)
  },
  createWebhook(appId: string, body: { url: string; subscribedEvents: string[] }) {
    return requestJson<WebhookEndpointWithSecret>(`/api/v1/apps/${appId}/webhooks`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  updateWebhook(
    appId: string,
    id: string,
    body: { url?: string; subscribedEvents?: string[]; status?: 'active' | 'disabled' },
  ) {
    return requestJson<WebhookEndpoint>(`/api/v1/apps/${appId}/webhooks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },
  rotateWebhookSecret(appId: string, id: string) {
    return requestJson<{ secret: string }>(`/api/v1/apps/${appId}/webhooks/${id}/rotate-secret`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
  deleteWebhook(appId: string, id: string) {
    return requestJson<{ ok: true }>(`/api/v1/apps/${appId}/webhooks/${id}`, {
      method: 'DELETE',
    })
  },
  testWebhook(appId: string, id: string) {
    return requestJson<WebhookTestResult>(`/api/v1/apps/${appId}/webhooks/${id}/test`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
  triggerEmployeeInfoSync() {
    return requestJson<{
      updated: number
      created: Array<{ sheetName: string; personalEmail: string; userId: string }>
      matched: Array<{ sheetName: string; dbName: string; email: string }>
      unmatched: Array<{ sheetName: string; reason: string }>
      errors: string[]
    }>('/api/v1/employee-info-sync/trigger', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
}
