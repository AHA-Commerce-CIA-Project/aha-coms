export const AUDIT_ACTIONS = [
  'POINT_SUBMITTED',
  'POINT_APPROVED',
  'POINT_REJECTED',
  'POINT_REVOKED',
  'CHALLENGE_FILED',
  'CHALLENGE_RESOLVED',
  'APPEAL_FILED',
  'APPEAL_RESOLVED',
  'REDEMPTION_REQUESTED',
  'REDEMPTION_APPROVED',
  'REDEMPTION_REJECTED',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_ARCHIVED',
  'USER_ACTIVATED',
  'TEAM_CREATED',
  'TEAM_UPDATED',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export const AUDIT_ENTITY_TYPES = [
  'achievement_points',
  'challenges',
  'appeals',
  'redemptions',
  'users',
  'teams',
] as const
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number]
