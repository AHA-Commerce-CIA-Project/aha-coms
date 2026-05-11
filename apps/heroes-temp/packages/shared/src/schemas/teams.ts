import { Type as t, type Static } from '@sinclair/typebox'

export const createTeamSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  branchKey: t.String({ maxLength: 128 }),
  leaderId: t.Optional(t.Union([t.String({ format: 'uuid' }), t.Null()])),
})

export const updateTeamSchema = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
  leaderId: t.Optional(t.Union([t.String({ format: 'uuid' }), t.Null()])),
})

export const listTeamsSchema = t.Object({
  page: t.Integer({ minimum: 1, default: 1 }),
  limit: t.Integer({ minimum: 1, maximum: 100, default: 20 }),
  search: t.Optional(t.String({ maxLength: 100 })),
})

export type CreateTeamInput = Static<typeof createTeamSchema>
export type UpdateTeamInput = Static<typeof updateTeamSchema>
export type ListTeamsInput = Static<typeof listTeamsSchema>
