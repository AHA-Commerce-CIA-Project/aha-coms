import { Type as t, type Static } from '@sinclair/typebox'
import { USER_ROLES } from '../constants'

export const createUserSchema = t.Object({
  email: t.String({ format: 'email' }),
  name: t.String({ minLength: 1, maxLength: 255 }),
  role: t.Union(USER_ROLES.map((r) => t.Literal(r))),
  branchKey: t.String({ maxLength: 128 }),
  teamId: t.Optional(t.Union([t.String({ format: 'uuid' }), t.Null()])),
  department: t.Optional(t.String({ maxLength: 100 })),
  position: t.Optional(t.String({ maxLength: 100 })),
  phone: t.Optional(t.String({ maxLength: 20 })),
  canSubmitPoints: t.Optional(t.Boolean()),
})

export const updateUserSchema = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  role: t.Optional(t.Union(USER_ROLES.map((r) => t.Literal(r)))),
  teamId: t.Optional(t.Union([t.String({ format: 'uuid' }), t.Null()])),
  department: t.Optional(t.String({ maxLength: 100 })),
  position: t.Optional(t.String({ maxLength: 100 })),
  phone: t.Optional(t.String({ maxLength: 20 })),
  isActive: t.Optional(t.Boolean()),
  canSubmitPoints: t.Optional(t.Boolean()),
})

export const listUsersSchema = t.Object({
  page: t.Integer({ minimum: 1, default: 1 }),
  limit: t.Integer({ minimum: 1, maximum: 100, default: 20 }),
  role: t.Optional(t.Union(USER_ROLES.map((r) => t.Literal(r)))),
  teamId: t.Optional(t.String({ format: 'uuid' })),
  search: t.Optional(t.String({ maxLength: 100 })),
  isActive: t.Optional(t.Boolean()),
  department: t.Optional(t.String({ maxLength: 100 })),
  position: t.Optional(t.String({ maxLength: 100 })),
  branchKey: t.Optional(t.String({ maxLength: 128 })),
})

export type CreateUserInput = Static<typeof createUserSchema>
export type UpdateUserInput = Static<typeof updateUserSchema>
export type ListUsersInput = Static<typeof listUsersSchema>
