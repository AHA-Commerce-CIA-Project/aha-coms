import { Type as t, type Static } from '@sinclair/typebox'

export const reportsQuerySchema = t.Object({
  startDate: t.Optional(t.String()),
  endDate: t.Optional(t.String()),
  branchKey: t.Optional(t.String({ maxLength: 128 })),
})

export type ReportsQueryInput = Static<typeof reportsQuerySchema>
