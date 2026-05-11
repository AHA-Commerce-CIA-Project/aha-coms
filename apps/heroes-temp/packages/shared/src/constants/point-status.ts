export const POINT_STATUSES = [
  'pending',
  'active',
  'challenged',
  'frozen',
  'revoked',
  'rejected',
] as const
export type PointStatus = (typeof POINT_STATUSES)[number]

export const REDEMPTION_STATUSES = ['pending', 'approved', 'rejected'] as const
export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number]

export const CHALLENGE_STATUSES = ['open', 'upheld', 'overturned'] as const
export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number]

export const APPEAL_STATUSES = ['open', 'upheld', 'overturned'] as const
export type AppealStatus = (typeof APPEAL_STATUSES)[number]
