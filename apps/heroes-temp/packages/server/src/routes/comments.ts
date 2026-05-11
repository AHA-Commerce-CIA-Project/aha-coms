import { Elysia, t } from 'elysia'
import {
  createCommentSchema,
  updateCommentSchema,
} from '@coms/shared/schemas'
import { paginationQuery } from './_query'
import * as commentsService from '../services/comments'
import type { AuthUser } from '../middleware/auth'

type Ctx = { authUser: AuthUser }

export const commentsRoute = new Elysia({ prefix: '/comments' })

  // GET /comments — list comments for an entity
  .get('/', async ({ query, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx

    const result = await commentsService.listComments(query, { actor })

    return {
      success: true,
      data: result.comments,
      error: null,
      meta: result.meta,
    }
  }, { query: t.Object({
    entityType: t.Union([t.Literal('achievement'), t.Literal('challenge'), t.Literal('appeal')]),
    entityId: t.String({ format: 'uuid' }),
    ...paginationQuery,
  }) })

  // POST /comments — create a comment
  .post('/', async ({ body, set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx

    try {
      const created = await commentsService.createComment(body, { actor })
      set.status = 201
      return { success: true, data: created, error: null }
    } catch (err) {
      if (err instanceof commentsService.EntityNotFoundError) {
        set.status = 404
        return { success: false, data: null, error: { code: 'NOT_FOUND', message: err.message } }
      }
      throw err
    }
  }, { body: createCommentSchema })

  // PATCH /comments/:id — update own comment
  .patch('/:id', async ({ params, body, set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx

    try {
      const updated = await commentsService.updateComment(params.id, body, {
        actor,
      })
      return { success: true, data: updated, error: null }
    } catch (err) {
      if (err instanceof commentsService.CommentNotFoundError) {
        set.status = 404
        return { success: false, data: null, error: { code: 'NOT_FOUND', message: err.message } }
      }
      if (err instanceof commentsService.NotCommentAuthorError) {
        set.status = 403
        return { success: false, data: null, error: { code: 'FORBIDDEN', message: err.message } }
      }
      throw err
    }
  }, { body: updateCommentSchema })
