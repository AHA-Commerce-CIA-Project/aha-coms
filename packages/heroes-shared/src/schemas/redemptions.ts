import { Type as t, type Static } from '@sinclair/typebox'
import { REDEMPTION_STATUSES } from '../constants'

export const requestRedemptionSchema = t.Object({
  rewardId: t.String({ format: 'uuid' }),
  notes: t.Optional(t.String({ maxLength: 500 })),
})

export const listRedemptionsSchema = t.Object({
  page: t.Integer({ minimum: 1, default: 1 }),
  limit: t.Integer({ minimum: 1, maximum: 100, default: 20 }),
  status: t.Optional(t.Union(REDEMPTION_STATUSES.map((s) => t.Literal(s)))),
  mine: t.Optional(t.Boolean()),
  search: t.Optional(t.String({ maxLength: 200 })),
  dateFrom: t.Optional(t.String()),
  dateTo: t.Optional(t.String()),
})

// Note: cross-field validation (rejectionReason required when status === 'rejected')
// must be checked at the handler level — TypeBox has no .refine() equivalent.
export const resolveRedemptionSchema = t.Object({
  status: t.Union([t.Literal('approved'), t.Literal('rejected')]),
  rejectionReason: t.Optional(t.String({ maxLength: 500 })),
})

export type RequestRedemptionInput = Static<typeof requestRedemptionSchema>
export type ListRedemptionsInput = Static<typeof listRedemptionsSchema>
export type ResolveRedemptionInput = Static<typeof resolveRedemptionSchema>
