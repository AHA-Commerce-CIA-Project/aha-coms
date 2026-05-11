import { Type as t, type Static } from '@sinclair/typebox'

export const fileAppealSchema = t.Object({
  reason: t.String({ minLength: 1, maxLength: 2000 }),
})

export const resolveAppealSchema = t.Object({
  status: t.Union([t.Literal('upheld'), t.Literal('overturned')]),
  resolutionNote: t.String({ minLength: 1, maxLength: 2000 }),
})

export const listAppealsSchema = t.Object({
  page: t.Integer({ minimum: 1, default: 1 }),
  limit: t.Integer({ minimum: 1, maximum: 100, default: 20 }),
})

export type FileAppealInput = Static<typeof fileAppealSchema>
export type ResolveAppealInput = Static<typeof resolveAppealSchema>
export type ListAppealsInput = Static<typeof listAppealsSchema>
