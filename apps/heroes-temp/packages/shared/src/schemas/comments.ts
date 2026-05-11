import { Type as t, type Static } from '@sinclair/typebox'

export const createCommentSchema = t.Object({
  entityType: t.Union([t.Literal('achievement'), t.Literal('challenge'), t.Literal('appeal')]),
  entityId: t.String({ format: 'uuid' }),
  body: t.String({ minLength: 1, maxLength: 5000 }),
})

export const updateCommentSchema = t.Object({
  body: t.String({ minLength: 1, maxLength: 5000 }),
})

export const listCommentsSchema = t.Object({
  entityType: t.Union([t.Literal('achievement'), t.Literal('challenge'), t.Literal('appeal')]),
  entityId: t.String({ format: 'uuid' }),
  page: t.Integer({ minimum: 1, default: 1 }),
  limit: t.Integer({ minimum: 1, maximum: 100, default: 20 }),
})

export type CreateCommentInput = Static<typeof createCommentSchema>
export type UpdateCommentInput = Static<typeof updateCommentSchema>
export type ListCommentsInput = Static<typeof listCommentsSchema>
