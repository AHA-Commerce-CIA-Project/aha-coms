import { pgEnum } from 'drizzle-orm/pg-core'

export const userRoleEnum = pgEnum('user_role', [
  'admin',
  'hr',
  'leader',
  'employee',
])

export const pointStatusEnum = pgEnum('point_status', [
  'pending',
  'active',
  'challenged',
  'frozen',
  'revoked',
  'rejected',
])

export const redemptionStatusEnum = pgEnum('redemption_status', [
  'pending',
  'approved',
  'rejected',
])
