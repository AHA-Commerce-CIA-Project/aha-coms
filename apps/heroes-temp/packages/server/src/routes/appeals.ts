import { Elysia, t } from 'elysia'
import {
  fileAppealSchema,
  resolveAppealSchema,
} from '@coms/shared/schemas'
import { paginationQuery } from './_query'
import * as appealsService from '../services/appeals'
import type { AuthUser } from '../middleware/auth'

type Ctx = { authUser: AuthUser }

export const appealsRoute = new Elysia()

  // GET /points/:id/appeals — list appeals for a point
  .get(
    '/points/:id/appeals',
    async ({ params, query, ...c }) => {
      const { authUser: actor } = c as unknown as Ctx

      const result = await appealsService.listAppeals(params.id, query, {
        actor,
      })

      return {
        success: true,
        data: result.appeals,
        error: null,
        meta: result.meta,
      }
    },
    { query: t.Object({ ...paginationQuery }) },
  )

  // POST /points/:id/appeals — file an appeal
  .post(
    '/points/:id/appeals',
    async ({ params, body, headers, set, ...c }) => {
      const { authUser: actor } = c as unknown as Ctx
      const ipAddress = headers['x-forwarded-for'] ?? headers['x-real-ip']

      try {
        const created = await appealsService.fileAppeal(params.id, body, {
          actor,
          ipAddress,
        })
        set.status = 201
        return { success: true, data: created, error: null }
      } catch (err) {
        if (err instanceof appealsService.AchievementNotFoundError) {
          set.status = 404
          return { success: false, data: null, error: { code: 'NOT_FOUND', message: err.message } }
        }
        if (err instanceof appealsService.NotPenaltiError) {
          set.status = 422
          return { success: false, data: null, error: { code: 'NOT_PENALTI', message: err.message } }
        }
        if (
          err instanceof appealsService.NotPenalizedUserError ||
          err instanceof appealsService.InsufficientRoleError
        ) {
          set.status = 403
          return { success: false, data: null, error: { code: 'FORBIDDEN', message: (err as Error).message } }
        }
        if (err instanceof appealsService.DuplicateOpenAppealError) {
          set.status = 409
          return { success: false, data: null, error: { code: 'DUPLICATE_APPEAL', message: err.message } }
        }
        throw err
      }
    },
    { body: fileAppealSchema },
  )

  // PATCH /appeals/:id/resolve — resolve an appeal (HR/admin only)
  .patch(
    '/appeals/:id/resolve',
    async ({ params, body, headers, set, ...c }) => {
      const { authUser: actor } = c as unknown as Ctx
      const ipAddress = headers['x-forwarded-for'] ?? headers['x-real-ip']

      try {
        const updated = await appealsService.resolveAppeal(params.id, body, {
          actor,
          ipAddress,
        })
        return { success: true, data: updated, error: null }
      } catch (err) {
        if (err instanceof appealsService.AppealNotFoundError) {
          set.status = 404
          return { success: false, data: null, error: { code: 'NOT_FOUND', message: err.message } }
        }
        if (err instanceof appealsService.AppealNotOpenError) {
          set.status = 409
          return { success: false, data: null, error: { code: 'NOT_OPEN', message: err.message } }
        }
        if (err instanceof appealsService.InsufficientRoleError) {
          set.status = 403
          return { success: false, data: null, error: { code: 'FORBIDDEN', message: err.message } }
        }
        throw err
      }
    },
    { body: resolveAppealSchema },
  )
