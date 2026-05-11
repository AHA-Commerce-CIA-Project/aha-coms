import { Elysia, t } from 'elysia'
import {
  requestRedemptionSchema,
  resolveRedemptionSchema,
} from '@coms/shared/schemas'
import { REDEMPTION_STATUSES } from '@coms/shared/constants'
import { paginationQuery } from './_query'
import { bulkRedemptionActionSchema } from '@coms/shared/schemas'
import * as redemptionsService from '../services/redemptions'
import type { AuthUser } from '../middleware/auth'

type Ctx = { authUser: AuthUser }

export const redemptionsRoute = new Elysia({ prefix: '/redemptions' })

  // POST / — request a redemption (any authenticated user)
  .post('/', async ({ body, headers, set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx
    const ipAddress = headers['x-forwarded-for'] ?? headers['x-real-ip']

    try {
      const created = await redemptionsService.requestRedemption(body, {
        actor,
        ipAddress,
      })
      set.status = 201
      return { success: true, data: created, error: null }
    } catch (err) {
      if (err instanceof redemptionsService.RewardNotFoundError) {
        set.status = 404
        return { success: false, data: null, error: { code: 'NOT_FOUND', message: err.message } }
      }
      if (err instanceof redemptionsService.RewardNotActiveError) {
        set.status = 422
        return { success: false, data: null, error: { code: 'REWARD_NOT_ACTIVE', message: err.message } }
      }
      if (err instanceof redemptionsService.InsufficientBalanceError) {
        set.status = 422
        return { success: false, data: null, error: { code: 'INSUFFICIENT_BALANCE', message: err.message } }
      }
      throw err
    }
  }, { body: requestRedemptionSchema })

  // POST /bulk — bulk approve/reject redemptions (HR/Admin only)
  .post('/bulk', async ({ body, headers, set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx
    const ipAddress = headers['x-forwarded-for'] ?? headers['x-real-ip']

    try {
      const result = await redemptionsService.bulkResolveRedemptions(body, { actor, ipAddress })
      return { success: true, data: result, error: null }
    } catch (err) {
      if (err instanceof redemptionsService.InsufficientRoleError) {
        set.status = 403
        return { success: false, data: null, error: { code: 'FORBIDDEN', message: err.message } }
      }
      throw err
    }
  }, {
    body: bulkRedemptionActionSchema,
    beforeHandle({ body, set }) {
      if (body.action === 'reject' && !body.rejectionReason) {
        set.status = 422
        return { success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'rejectionReason is required when rejecting', path: ['rejectionReason'] } }
      }
    },
  })

  // GET / — list redemptions (with optional mine filter)
  .get('/', async ({ query, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx

    const result = await redemptionsService.listRedemptions(query, { actor })

    return {
      success: true,
      data: result.redemptions,
      error: null,
      meta: result.meta,
    }
  }, { query: t.Object({
    ...paginationQuery,
    status: t.Optional(t.Union(REDEMPTION_STATUSES.map((s) => t.Literal(s)))),
    mine: t.Optional(t.BooleanString()),
    search: t.Optional(t.String({ maxLength: 200 })),
    dateFrom: t.Optional(t.String()),
    dateTo: t.Optional(t.String()),
  }) })

  // GET /:id — get redemption by id
  .get('/:id', async ({ params, set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx

    try {
      const redemption = await redemptionsService.getRedemptionById(params.id, {
        actor,
      })
      return { success: true, data: redemption, error: null }
    } catch (err) {
      if (err instanceof redemptionsService.RedemptionNotFoundError) {
        set.status = 404
        return { success: false, data: null, error: { code: 'NOT_FOUND', message: err.message } }
      }
      throw err
    }
  })

  // PATCH /:id/approve — approve a redemption (HR/Admin only)
  .patch('/:id/approve', async ({ params, headers, set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx
    const ipAddress = headers['x-forwarded-for'] ?? headers['x-real-ip']

    try {
      const updated = await redemptionsService.approveRedemption(params.id, {
        actor,
        ipAddress,
      })
      return { success: true, data: updated, error: null }
    } catch (err) {
      if (err instanceof redemptionsService.RedemptionNotFoundError) {
        set.status = 404
        return { success: false, data: null, error: { code: 'NOT_FOUND', message: err.message } }
      }
      if (err instanceof redemptionsService.RedemptionNotPendingError) {
        set.status = 409
        return { success: false, data: null, error: { code: 'NOT_PENDING', message: err.message } }
      }
      if (err instanceof redemptionsService.InsufficientRoleError) {
        set.status = 403
        return { success: false, data: null, error: { code: 'FORBIDDEN', message: err.message } }
      }
      throw err
    }
  })

  // PATCH /:id/reject — reject a redemption (HR/Admin only)
  .patch('/:id/reject', async ({ params, body, headers, set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx
    const ipAddress = headers['x-forwarded-for'] ?? headers['x-real-ip']

    try {
      const updated = await redemptionsService.rejectRedemption(params.id, body, {
        actor,
        ipAddress,
      })
      return { success: true, data: updated, error: null }
    } catch (err) {
      if (err instanceof redemptionsService.RedemptionNotFoundError) {
        set.status = 404
        return { success: false, data: null, error: { code: 'NOT_FOUND', message: err.message } }
      }
      if (err instanceof redemptionsService.RedemptionNotPendingError) {
        set.status = 409
        return { success: false, data: null, error: { code: 'NOT_PENDING', message: err.message } }
      }
      if (err instanceof redemptionsService.InsufficientRoleError) {
        set.status = 403
        return { success: false, data: null, error: { code: 'FORBIDDEN', message: err.message } }
      }
      throw err
    }
  }, {
    body: resolveRedemptionSchema,
    beforeHandle({ body, set }) {
      if (body.status === 'rejected' && !body.rejectionReason) {
        set.status = 422
        return { success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'rejectionReason is required when status is rejected', path: ['rejectionReason'] } }
      }
    },
  })
