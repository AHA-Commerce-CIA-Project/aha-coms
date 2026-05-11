import { Type as t, type Static } from '@sinclair/typebox'

export const listAuditLogsSchema = t.Object({
  page: t.Integer({ minimum: 1, default: 1 }),
  limit: t.Integer({ minimum: 1, maximum: 100, default: 50 }),
  action: t.Optional(t.String()),
  entityType: t.Optional(t.String()),
  actorId: t.Optional(t.String({ format: 'uuid' })),
  startDate: t.Optional(t.String()),
  endDate: t.Optional(t.String()),
})

export type ListAuditLogsInput = Static<typeof listAuditLogsSchema>
