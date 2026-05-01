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

export interface EmployeeEmailEntry {
  emailId?: string
  address: string
  kind: 'workspace' | 'personal'
  isPrimary: boolean
  verified: boolean
  addedBy?: string
}

export interface EmployeeRecord {
  id: string
  name: string
  phone: string | null
  department: string | null
  position: string | null
  branch: string | null
  birthDate?: string | null
  leaderName?: string | null
  portalRole: PortalRole
  status: string
  provisioningStatus: 'ready' | 'pending' | 'processing' | 'failed'
  provisioningError: string | null
  hasGoogleWorkspace: boolean
  emails: EmployeeEmailEntry[]
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
    appRoles: Array<{ appId: string; appRole: string }>
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
  serviceAccountEmail: string | null
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

export interface AliasQueueItem {
  id: string
  rawName: string
  rawNameNormalized: string
  suggestedIdentityUserId: string | null
  source: string
  context: Record<string, unknown>
  createdAt: string
}

export interface AliasQueueGroup {
  rawNameNormalized: string
  count: number
  oldestAt: string
  items: AliasQueueItem[]
}

export interface AliasQueueResponse {
  groups: AliasQueueGroup[]
}

export interface AppConfigManifest {
  appId: string
  displayName: string
  schemaVersion: number
  configSchema: Record<string, { type: string; values?: string[]; default: unknown }>
}

export interface AppConfigRow {
  portalSub: string
  name: string
  email: string
  config: Record<string, unknown>
  schemaVersion: number
  updatedAt: string
}

export interface AppConfigListResponse {
  manifests: AppConfigManifest[]
  rows: AppConfigRow[]
}

export interface BulkPreviewChange {
  portalSub: string
  previousConfig: Record<string, unknown>
  newConfig: Record<string, unknown>
}

export interface BulkPreviewResponse {
  changes: BulkPreviewChange[]
  totalRows: number
}

export interface BulkCommitResponse {
  ok: true
  batchId: string
  updatedCount: number
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
    workspaceEmail?: string
    personalEmail?: string
    name: string
    phone?: string
    department?: string
    position?: string
    branch?: 'Indonesia' | 'Thailand'
    portalRole?: PortalRole
    teamId?: string
    birthDate?: string
    leaderName?: string
  }) {
    return requestJson<CreateEmployeeResult>(`/api/v1/employees`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  updateEmployee(
    id: string,
    body: {
      portalRole?: string
      hasGoogleWorkspace?: boolean
      name?: string
      phone?: string
      department?: string
      position?: string
      branch?: 'Indonesia' | 'Thailand'
      birthDate?: string
      leaderName?: string
      teamId?: string
    },
  ) {
    return requestJson<{ ok: true }>(`/api/v1/employees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },
  // ---- Admin email management (PR D) ---------------------------------------
  // requestJson throws on non-2xx so the structured 409 collision body is lost;
  // these wrappers do raw fetch and return discriminated unions.
  async addEmployeeEmail(
    id: string,
    body: { email: string; kind: 'workspace' | 'personal' },
  ): Promise<
    | { kind: 'added'; emailId: string; isPrimary: boolean }
    | { kind: 'email_in_use'; collisionUserId: string; collisionUserName: string }
    | { kind: 'target_not_found' }
    | { kind: 'network_error'; message: string }
  > {
    const res = await fetch(`/api/v1/employees/${id}/emails`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (res.ok && json.ok === true) {
      return { kind: 'added', emailId: String(json.emailId ?? ''), isPrimary: Boolean(json.isPrimary) }
    }
    if (res.status === 409 && json.error === 'EMAIL_IN_USE') {
      return {
        kind: 'email_in_use',
        collisionUserId: String(json.collisionUserId ?? ''),
        collisionUserName: String(json.collisionUserName ?? ''),
      }
    }
    if (res.status === 404 && json.error === 'TARGET_NOT_FOUND') {
      return { kind: 'target_not_found' }
    }
    return { kind: 'network_error', message: String(json.message ?? `Request failed (${res.status})`) }
  },
  async updateEmployeeEmail(
    id: string,
    emailId: string,
    body: { email?: string; isPrimary?: boolean },
  ): Promise<
    | { kind: 'updated' }
    | { kind: 'email_in_use'; collisionUserId: string; collisionUserName: string }
    | { kind: 'not_found' }
    | { kind: 'not_verified'; message: string }
    | { kind: 'network_error'; message: string }
  > {
    const res = await fetch(`/api/v1/employees/${id}/emails/${emailId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (res.ok && json.ok === true) return { kind: 'updated' }
    if (res.status === 409 && json.error === 'EMAIL_IN_USE') {
      return {
        kind: 'email_in_use',
        collisionUserId: String(json.collisionUserId ?? ''),
        collisionUserName: String(json.collisionUserName ?? ''),
      }
    }
    if (res.status === 404) return { kind: 'not_found' }
    if (json.error === 'NOT_VERIFIED') {
      return { kind: 'not_verified', message: String(json.message ?? '') }
    }
    return { kind: 'network_error', message: String(json.message ?? `Request failed (${res.status})`) }
  },
  async removeEmployeeEmail(
    id: string,
    emailId: string,
  ): Promise<
    | { kind: 'removed' }
    | { kind: 'last_verified_email'; message: string }
    | { kind: 'not_found' }
    | { kind: 'network_error'; message: string }
  > {
    const res = await fetch(`/api/v1/employees/${id}/emails/${emailId}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (res.ok && json.ok === true) return { kind: 'removed' }
    if (res.status === 409 && json.error === 'LAST_VERIFIED_EMAIL') {
      return { kind: 'last_verified_email', message: String(json.message ?? '') }
    }
    if (res.status === 404) return { kind: 'not_found' }
    return { kind: 'network_error', message: String(json.message ?? `Request failed (${res.status})`) }
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
  addTeamMembersBatch(id: string, body: { members: Array<{ userId: string; roleInTeam?: string }> }) {
    return requestJson<{ ok: true }>(`/api/v1/teams/${id}/members/batch`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  removeTeamMember(id: string, userId: string) {
    return requestJson<{ ok: true }>(`/api/v1/teams/${id}/members/${userId}`, {
      method: 'DELETE',
    })
  },
  grantTeamApp(id: string, body: { appId: string }) {
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
  setMemberAppRole(userId: string, appId: string, appRole: string) {
    return requestJson<{ ok: true }>(`/api/v1/members/${userId}/apps/${appId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ appRole }),
    })
  },
  removeMemberAppRole(userId: string, appId: string) {
    return requestJson<{ ok: true }>(`/api/v1/members/${userId}/apps/${appId}/role`, {
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
      serviceAccountEmail?: string
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

  // ---------------------------------------------------------------------------
  // Alias collision queue
  // ---------------------------------------------------------------------------

  listAliasQueue() {
    return requestJson<AliasQueueResponse>('/api/v1/admin/alias-queue')
  },
  resolveAliasQueue(id: string, body: { identityUserId: string }) {
    return requestJson<{ aliasId: string }>(`/api/v1/admin/alias-queue/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  rejectAliasQueue(id: string, body: { reason: string }) {
    return requestJson<{ ok: true }>(`/api/v1/admin/alias-queue/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  // ---------------------------------------------------------------------------
  // App config
  // ---------------------------------------------------------------------------

  listAppConfig(appId: string, filter: string) {
    const params = new URLSearchParams()
    if (appId) params.set('appId', appId)
    if (filter) params.set('filter', filter)
    return requestJson<AppConfigListResponse>(`/api/v1/admin/app-config?${params.toString()}`)
  },
  updateSingleAppConfig(body: { appId: string; portalSub: string; config: Record<string, unknown> }) {
    return requestJson<{ ok: true }>('/api/v1/admin/app-config/single', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  bulkPreviewAppConfig(body: { appId: string; rows: Array<{ portalSub: string; config: Record<string, unknown> }> }) {
    return requestJson<BulkPreviewResponse>('/api/v1/admin/app-config/bulk-preview', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  bulkCommitAppConfig(body: { appId: string; rows: Array<{ portalSub: string; config: Record<string, unknown> }> }) {
    return requestJson<BulkCommitResponse>('/api/v1/admin/app-config/bulk-commit', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  downloadAppConfigCsv(appId: string) {
    return fetch(`/api/v1/admin/app-config/csv?appId=${encodeURIComponent(appId)}`)
  },
  // Spec 06 PR E §9 — admin sign-out-everywhere
  signOutAllSessions(userId: string) {
    return requestJson<{ revoked: number }>(`/api/v1/employees/${userId}/sign-out-all`, {
      method: 'POST',
    })
  },
  // Spec 06 PR E §11 — super_admin one-time login link
  issueOneTimeLoginLink(
    userId: string,
    body: {
      reason: 'lost_email_access' | 'support_handoff' | 'identity_recovery' | 'other'
      reasonText?: string
    },
  ) {
    return requestJson<{ id: string; url: string; expiresAt: string }>(
      `/api/v1/employees/${userId}/login-link`,
      { method: 'POST', body: JSON.stringify(body) },
    )
  },
  listOneTimeLoginLinks(userId: string) {
    return requestJson<{
      links: Array<{
        id: string
        issuedBy: { id: string; name: string }
        reason: string
        reasonText: string | null
        expiresAt: string
        consumedAt: string | null
        createdAt: string
      }>
    }>(`/api/v1/employees/${userId}/login-links`)
  },
}
