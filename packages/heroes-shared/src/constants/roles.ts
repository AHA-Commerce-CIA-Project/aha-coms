export const USER_ROLES = ['admin', 'hr', 'leader', 'employee'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 0,
  hr: 1,
  leader: 2,
  employee: 3,
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  hr: 'HR',
  leader: 'Leader',
  employee: 'Employee',
}
