export type { ApiResponse, ApiError, ApiResult, PaginationMeta } from './api'

import type { UserRole } from '../constants/roles'

export type AuthUser = {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly role: UserRole
  readonly branchId: string
  readonly teamId: string | null
  readonly canSubmitPoints: boolean
  readonly mustChangePassword: boolean
  readonly portalRole: string
  readonly apps: readonly string[]
}
