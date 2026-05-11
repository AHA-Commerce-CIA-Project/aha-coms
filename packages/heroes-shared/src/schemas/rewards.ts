import { Type as t, type Static } from '@sinclair/typebox'

export const listRewardsSchema = t.Object({
  page: t.Integer({ minimum: 1, default: 1 }),
  limit: t.Integer({ minimum: 1, maximum: 100, default: 20 }),
})

export const createRewardSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 200 }),
  description: t.Optional(t.String()),
  pointCost: t.Integer({ minimum: 1 }),
  imageUrl: t.Optional(t.String({ format: 'uri' })),
})

export const updateRewardSchema = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
  description: t.Optional(t.String()),
  pointCost: t.Optional(t.Integer({ minimum: 1 })),
  imageUrl: t.Optional(t.String({ format: 'uri' })),
  isActive: t.Optional(t.Boolean()),
})

export type ListRewardsInput = Static<typeof listRewardsSchema>
export type CreateRewardInput = Static<typeof createRewardSchema>
export type UpdateRewardInput = Static<typeof updateRewardSchema>
