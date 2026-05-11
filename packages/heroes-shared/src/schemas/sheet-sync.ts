import { Type as t, type Static } from '@sinclair/typebox'

export const syncJobSchema = t.Object({
  id: t.String({ format: 'uuid' }),
  direction: t.String(),
  sheetId: t.String(),
  sheetName: t.Union([t.String(), t.Null()]),
  status: t.String(),
  rowsProcessed: t.Integer(),
  rowsFailed: t.Integer(),
  errorLog: t.Any(),
  startedBy: t.Union([t.String({ format: 'uuid' }), t.Null()]),
  startedAt: t.Union([t.String(), t.Null()]),
  completedAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
})

export const syncStatusSchema = t.Object({
  isRunning: t.Boolean(),
  lastJob: t.Union([syncJobSchema, t.Null()]),
  schedulerEnabled: t.Boolean(),
  intervalMs: t.Integer(),
})

export type SyncJob = Static<typeof syncJobSchema>
export type SyncStatus = Static<typeof syncStatusSchema>
