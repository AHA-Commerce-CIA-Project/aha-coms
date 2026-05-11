import { Type as t, type Static } from '@sinclair/typebox'

// Note: cross-field validation (rejectionReason required when action === 'reject')
// must be checked at the handler level — TypeBox has no .refine() equivalent.
export const bulkRedemptionActionSchema = t.Object({
  ids: t.Array(t.String({ format: 'uuid' }), { minItems: 1, maxItems: 100 }),
  action: t.Union([t.Literal('approve'), t.Literal('reject')]),
  rejectionReason: t.Optional(t.String({ maxLength: 500 })),
})

export const bulkPointActionSchema = t.Object({
  ids: t.Array(t.String({ format: 'uuid' }), { minItems: 1, maxItems: 100 }),
  action: t.Union([t.Literal('approve'), t.Literal('reject')]),
  reason: t.Optional(t.String({ maxLength: 500 })),
})

export const bulkUserActionSchema = t.Object({
  ids: t.Array(t.String({ format: 'uuid' }), { minItems: 1, maxItems: 100 }),
  action: t.Union([t.Literal('archive'), t.Literal('activate')]),
})

export type BulkResultItem = { id: string; success: boolean; error?: string }
export type BulkResult = {
  processed: number
  succeeded: number
  failed: number
  results: BulkResultItem[]
}

export type BulkRedemptionActionInput = Static<typeof bulkRedemptionActionSchema>
export type BulkPointActionInput = Static<typeof bulkPointActionSchema>
export type BulkUserActionInput = Static<typeof bulkUserActionSchema>
