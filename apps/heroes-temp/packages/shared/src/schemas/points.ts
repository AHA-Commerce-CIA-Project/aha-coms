import { Type as t, type Static } from '@sinclair/typebox'
import { KITTA_CODES, POINT_STATUSES, POINT_CATEGORY_CODES } from '../constants'

// Note: cross-field validation (kittaComponent required for PENALTI, BINTANG
// always 1 point, etc.) must be checked at the handler/service level —
// TypeBox has no .refine() equivalent.
export const submitPointSchema = t.Object({
  userId: t.String({ format: 'uuid' }),
  categoryCode: t.Union(POINT_CATEGORY_CODES.map((c) => t.Literal(c))),
  points: t.Integer({ minimum: 1, maximum: 10 }),
  reason: t.String({ minLength: 1, maxLength: 1000 }),
  relatedStaff: t.Optional(t.String({ maxLength: 500 })),
  screenshotUrl: t.Optional(t.String({ format: 'uri' })),
  kittaComponent: t.Optional(t.Union(KITTA_CODES.map((c) => t.Literal(c)))),
})

export const listPointsSchema = t.Object({
  page: t.Integer({ minimum: 1, default: 1 }),
  limit: t.Integer({ minimum: 1, maximum: 100, default: 20 }),
  categoryCode: t.Optional(t.Union(POINT_CATEGORY_CODES.map((c) => t.Literal(c)))),
  status: t.Optional(t.Union(POINT_STATUSES.map((s) => t.Literal(s)))),
  userId: t.Optional(t.String({ format: 'uuid' })),
  teamId: t.Optional(t.String({ format: 'uuid' })),
  search: t.Optional(t.String({ maxLength: 200 })),
  submittedBy: t.Optional(t.String({ format: 'uuid' })),
  dateFrom: t.Optional(t.String()),
  dateTo: t.Optional(t.String()),
})

export const approveRejectSchema = t.Object({
  reason: t.Optional(t.String({ maxLength: 500 })),
})

export type SubmitPointInput = Static<typeof submitPointSchema>
export type ListPointsInput = Static<typeof listPointsSchema>
export type ApproveRejectInput = Static<typeof approveRejectSchema>
