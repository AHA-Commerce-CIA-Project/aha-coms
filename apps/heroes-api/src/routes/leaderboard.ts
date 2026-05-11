import { Elysia, t } from 'elysia'
import { paginationQuery } from './_query'
import * as leaderboardService from '../services/leaderboard'
import type { AuthUser } from '../middleware/auth'

type Ctx = { authUser: AuthUser }

export const leaderboardRoute = new Elysia({ prefix: '/leaderboard' })

  // GET /leaderboard — ranked list by bintang or poin_aha
  .get(
    '/',
    async ({ query, ...c }) => {
      const { authUser: actor } = c as unknown as Ctx

      const result = await leaderboardService.getLeaderboard(query, { actor })

      return {
        success: true,
        data: result.entries,
        error: null,
        meta: result.meta,
      }
    },
    {
      query: t.Object({
        type: t.Union([t.Literal('bintang'), t.Literal('poin_aha'), t.Literal('penalti')], {
          default: 'bintang',
        }),
        teamId: t.Optional(t.String({ format: 'uuid' })),
        months: t.Optional(t.Numeric({ minimum: 1, maximum: 12 })),
        ...paginationQuery,
      }),
    },
  )
