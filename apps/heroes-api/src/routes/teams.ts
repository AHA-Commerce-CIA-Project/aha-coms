import { Elysia, t } from 'elysia'
import { requireRole } from '../middleware/rbac'
import {
  createTeamSchema,
  updateTeamSchema,
} from '@coms/shared/schemas'
import { paginationQuery } from './_query'
import * as teamsService from '../services/teams'
import type { AuthUser } from '../middleware/auth'

type Ctx = { authUser: AuthUser }

export const teamsRoute = new Elysia({ prefix: '/teams' })

  // GET /teams — list with search + pagination (all authenticated users)
  .get('/', async ({ query, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx

    const result = await teamsService.listTeams(query, { actor })

    return {
      success: true,
      data: result.teams,
      error: null,
      meta: result.meta,
    }
  }, { query: t.Object({
    ...paginationQuery,
    search: t.Optional(t.String({ maxLength: 100 })),
  }) })

  // GET /teams/:id — single team with members
  .get('/:id', async ({ params, set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx

    try {
      const team = await teamsService.getTeamById(params.id, { actor })
      return { success: true, data: team, error: null }
    } catch (err) {
      if (err instanceof teamsService.TeamNotFoundError) {
        set.status = 404
        return { success: false, data: null, error: { code: 'NOT_FOUND', message: err.message } }
      }
      throw err
    }
  })

  // POST /teams — create new team (admin/hr only)
  .post('/', async ({ body, headers, set, ...c }) => {
    requireRole('admin', 'hr')(c as unknown as { authUser: AuthUser })
    const { authUser: actor } = c as unknown as Ctx
    const ipAddress = headers['x-forwarded-for'] ?? headers['x-real-ip']

    const created = await teamsService.createTeam(body, { actor, ipAddress })
    set.status = 201
    return { success: true, data: created, error: null }
  }, { body: createTeamSchema })

  // PATCH /teams/:id — update team (admin/hr only)
  .patch('/:id', async ({ params, body, headers, set, ...c }) => {
    requireRole('admin', 'hr')(c as unknown as { authUser: AuthUser })
    const { authUser: actor } = c as unknown as Ctx
    const ipAddress = headers['x-forwarded-for'] ?? headers['x-real-ip']

    try {
      const updated = await teamsService.updateTeam(params.id, body, { actor, ipAddress })
      return { success: true, data: updated, error: null }
    } catch (err) {
      if (err instanceof teamsService.TeamNotFoundError) {
        set.status = 404
        return { success: false, data: null, error: { code: 'NOT_FOUND', message: err.message } }
      }
      throw err
    }
  }, { body: updateTeamSchema })
