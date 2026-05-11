import { Type as t, type Static } from '@sinclair/typebox'

export const fileChallengeSchema = t.Object({
  reason: t.String({ minLength: 1, maxLength: 2000 }),
})

export const resolveChallengeSchema = t.Object({
  status: t.Union([t.Literal('upheld'), t.Literal('overturned')]),
  resolutionNote: t.String({ minLength: 1, maxLength: 2000 }),
})

export const listChallengesSchema = t.Object({
  page: t.Integer({ minimum: 1, default: 1 }),
  limit: t.Integer({ minimum: 1, maximum: 100, default: 20 }),
})

export type FileChallengeInput = Static<typeof fileChallengeSchema>
export type ResolveChallengeInput = Static<typeof resolveChallengeSchema>
export type ListChallengesInput = Static<typeof listChallengesSchema>
