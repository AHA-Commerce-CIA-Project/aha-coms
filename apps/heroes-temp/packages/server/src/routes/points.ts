import { Elysia, t } from 'elysia'
import { submitPointSchema, approveRejectSchema } from '@coms/shared/schemas'
import { POINT_STATUSES, POINT_CATEGORY_CODES } from '@coms/shared/constants'
import { paginationQuery } from './_query'
import { bulkPointActionSchema } from '@coms/shared/schemas'
import * as pointsService from '../services/points'
import * as approvalService from '../services/approval'
import type { AuthUser } from '../middleware/auth'

type Ctx = { authUser: AuthUser }

export const pointsRoute = new Elysia({ prefix: '/points' })

  // POST /points — submit a new point
  .post('/', async ({ body, headers, set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx
    const ipAddress = headers['x-forwarded-for'] ?? headers['x-real-ip']

    try {
      const created = await pointsService.submitPoint(body, {
        actor,
        ipAddress,
      })
      set.status = 201
      return { success: true, data: created, error: null }
    } catch (err) {
      if (err instanceof pointsService.CategoryNotFoundError) {
        set.status = 404
        return { success: false, data: null, error: { code: 'NOT_FOUND', message: err.message } }
      }
      if (err instanceof pointsService.CategoryDisabledError) {
        set.status = 422
        return { success: false, data: null, error: { code: 'CATEGORY_DISABLED', message: err.message } }
      }
      if (err instanceof pointsService.TargetUserNotFoundError) {
        set.status = 404
        return { success: false, data: null, error: { code: 'USER_NOT_FOUND', message: err.message } }
      }
      if (err instanceof pointsService.ScreenshotRequiredError) {
        set.status = 422
        return { success: false, data: null, error: { code: 'SCREENSHOT_REQUIRED', message: err.message } }
      }
      if (
        err instanceof pointsService.SelfPenaltiError ||
        err instanceof pointsService.LeaderSelfGiveError ||
        err instanceof pointsService.EmployeeSelfOnlyError
      ) {
        set.status = 403
        return { success: false, data: null, error: { code: 'FORBIDDEN', message: (err as Error).message } }
      }
      throw err
    }
  }, {
    body: submitPointSchema,
    beforeHandle({ body, set }) {
      if (body.categoryCode === 'PENALTI' && !body.kittaComponent) {
        set.status = 422
        return { success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'KITTA component is required for Penalti', path: ['kittaComponent'] } }
      }
      if (body.categoryCode !== 'PENALTI' && body.kittaComponent != null) {
        set.status = 422
        return { success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'KITTA component is only for Penalti', path: ['kittaComponent'] } }
      }
      if (body.categoryCode === 'BINTANG' && body.points !== 1) {
        set.status = 422
        return { success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Bintang is always 1 point', path: ['points'] } }
      }
    },
  })

  // POST /points/bulk — bulk approve/reject points (HR/Admin/Leader)
  .post('/bulk', async ({ body, headers, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx
    const ipAddress = headers['x-forwarded-for'] ?? headers['x-real-ip']

    const result = await approvalService.bulkResolvePoints(body, { actor, ipAddress })
    return { success: true, data: result, error: null }
  }, { body: bulkPointActionSchema })

  // GET /points — paginated list with filters
  .get('/', async ({ query, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx

    const result = await pointsService.listPoints(query, { actor })

    return {
      success: true,
      data: result.points,
      error: null,
      meta: result.meta,
    }
  }, { query: t.Object({
    ...paginationQuery,
    categoryCode: t.Optional(t.Union(POINT_CATEGORY_CODES.map((c) => t.Literal(c)))),
    status: t.Optional(t.Union(POINT_STATUSES.map((s) => t.Literal(s)))),
    userId: t.Optional(t.String({ format: 'uuid' })),
    teamId: t.Optional(t.String({ format: 'uuid' })),
    search: t.Optional(t.String({ maxLength: 200 })),
    submittedBy: t.Optional(t.String({ format: 'uuid' })),
    dateFrom: t.Optional(t.String()),
    dateTo: t.Optional(t.String()),
  }) })

  // GET /points/:id — detail with submitter info
  .get('/:id', async ({ params, set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx

    try {
      const point = await pointsService.getPointById(params.id, { actor })
      return { success: true, data: point, error: null }
    } catch (err) {
      if (err instanceof pointsService.PointNotFoundError) {
        set.status = 404
        return { success: false, data: null, error: { code: 'NOT_FOUND', message: err.message } }
      }
      throw err
    }
  })

  // PATCH /points/:id/approve — approve a pending point
  .patch('/:id/approve', async ({ params, body, headers, set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx
    const ipAddress = headers['x-forwarded-for'] ?? headers['x-real-ip']

    try {
      const updated = await approvalService.approvePoint(params.id, body, { actor, ipAddress })
      return { success: true, data: updated, error: null }
    } catch (err) {
      if (err instanceof approvalService.PointNotFoundError) {
        set.status = 404
        return { success: false, data: null, error: { code: 'NOT_FOUND', message: err.message } }
      }
      if (err instanceof approvalService.PointNotPendingError) {
        set.status = 409
        return { success: false, data: null, error: { code: 'NOT_PENDING', message: err.message } }
      }
      if (err instanceof approvalService.UnauthorizedApprovalError) {
        set.status = 403
        return { success: false, data: null, error: { code: 'FORBIDDEN', message: err.message } }
      }
      throw err
    }
  }, { body: approveRejectSchema })

  // PATCH /points/:id/reject — reject a pending point
  .patch('/:id/reject', async ({ params, body, headers, set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx
    const ipAddress = headers['x-forwarded-for'] ?? headers['x-real-ip']

    try {
      const updated = await approvalService.rejectPoint(params.id, body, { actor, ipAddress })
      return { success: true, data: updated, error: null }
    } catch (err) {
      if (err instanceof approvalService.PointNotFoundError) {
        set.status = 404
        return { success: false, data: null, error: { code: 'NOT_FOUND', message: err.message } }
      }
      if (err instanceof approvalService.PointNotPendingError) {
        set.status = 409
        return { success: false, data: null, error: { code: 'NOT_PENDING', message: err.message } }
      }
      if (err instanceof approvalService.UnauthorizedApprovalError) {
        set.status = 403
        return { success: false, data: null, error: { code: 'FORBIDDEN', message: err.message } }
      }
      throw err
    }
  }, { body: approveRejectSchema })

  // PATCH /points/:id/revoke — revoke an active point (HR/Admin only)
  .patch('/:id/revoke', async ({ params, body, headers, set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx
    const ipAddress = headers['x-forwarded-for'] ?? headers['x-real-ip']

    try {
      const updated = await approvalService.revokePoint(params.id, body, { actor, ipAddress })
      return { success: true, data: updated, error: null }
    } catch (err) {
      if (err instanceof approvalService.PointNotFoundError) {
        set.status = 404
        return { success: false, data: null, error: { code: 'NOT_FOUND', message: err.message } }
      }
      if (err instanceof approvalService.PointNotActiveError) {
        set.status = 409
        return { success: false, data: null, error: { code: 'NOT_ACTIVE', message: err.message } }
      }
      if (err instanceof approvalService.UnauthorizedApprovalError) {
        set.status = 403
        return { success: false, data: null, error: { code: 'FORBIDDEN', message: err.message } }
      }
      throw err
    }
  }, { body: approveRejectSchema })
