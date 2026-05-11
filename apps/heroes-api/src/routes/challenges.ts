import { Elysia, t } from 'elysia'
import {
  fileChallengeSchema,
  resolveChallengeSchema,
} from '@coms/shared/schemas'
import { paginationQuery } from './_query'
import * as challengesService from '../services/challenges'
import type { AuthUser } from '../middleware/auth'

type Ctx = { authUser: AuthUser }

export const challengesRoute = new Elysia()

  // GET /points/:id/challenges — list challenges for a point
  .get(
    '/points/:id/challenges',
    async ({ params, query, ...c }) => {
      const { authUser: actor } = c as unknown as Ctx

      const result = await challengesService.listChallenges(params.id, query, {
        actor,
      })

      return {
        success: true,
        data: result.challenges,
        error: null,
        meta: result.meta,
      }
    },
    { query: t.Object({ ...paginationQuery }) },
  )

  // POST /points/:id/challenges — file a challenge
  .post(
    '/points/:id/challenges',
    async ({ params, body, headers, set, ...c }) => {
      const { authUser: actor } = c as unknown as Ctx
      const ipAddress = headers['x-forwarded-for'] ?? headers['x-real-ip']

      try {
        const created = await challengesService.fileChallenge(params.id, body, {
          actor,
          ipAddress,
        })
        set.status = 201
        return { success: true, data: created, error: null }
      } catch (err) {
        if (err instanceof challengesService.AchievementNotFoundError) {
          set.status = 404
          return { success: false, data: null, error: { code: 'NOT_FOUND', message: err.message } }
        }
        if (err instanceof challengesService.NotPenaltiError) {
          set.status = 422
          return { success: false, data: null, error: { code: 'NOT_PENALTI', message: err.message } }
        }
        if (
          err instanceof challengesService.InsufficientRoleError ||
          err instanceof challengesService.CannotChallengeSelfError
        ) {
          set.status = 403
          return { success: false, data: null, error: { code: 'FORBIDDEN', message: (err as Error).message } }
        }
        throw err
      }
    },
    { body: fileChallengeSchema },
  )

  // PATCH /challenges/:id/resolve — resolve a challenge (HR/admin only)
  .patch(
    '/challenges/:id/resolve',
    async ({ params, body, headers, set, ...c }) => {
      const { authUser: actor } = c as unknown as Ctx
      const ipAddress = headers['x-forwarded-for'] ?? headers['x-real-ip']

      try {
        const updated = await challengesService.resolveChallenge(params.id, body, {
          actor,
          ipAddress,
        })
        return { success: true, data: updated, error: null }
      } catch (err) {
        if (err instanceof challengesService.ChallengeNotFoundError) {
          set.status = 404
          return { success: false, data: null, error: { code: 'NOT_FOUND', message: err.message } }
        }
        if (err instanceof challengesService.ChallengeNotOpenError) {
          set.status = 409
          return { success: false, data: null, error: { code: 'NOT_OPEN', message: err.message } }
        }
        if (err instanceof challengesService.InsufficientRoleError) {
          set.status = 403
          return { success: false, data: null, error: { code: 'FORBIDDEN', message: err.message } }
        }
        throw err
      }
    },
    { body: resolveChallengeSchema },
  )
