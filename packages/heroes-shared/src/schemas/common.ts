import { Type as t, type Static } from '@sinclair/typebox'

export const uuidSchema = t.String({ format: 'uuid' })

export const paginationSchema = t.Object({
  page: t.Integer({ minimum: 1, default: 1 }),
  limit: t.Integer({ minimum: 1, maximum: 100, default: 20 }),
})

export type PaginationInput = Static<typeof paginationSchema>
