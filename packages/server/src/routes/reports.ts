import { Elysia, t } from 'elysia'
import * as reportsService from '../services/reports'
import type { AuthUser } from '../middleware/auth'

type Ctx = { authUser: AuthUser }

export const reportsRoute = new Elysia({ prefix: '/reports' })

  // GET / — get dashboard stats (HR/Admin)
  .get('/', async ({ query, set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx

    try {
      const data = await reportsService.getDashboardStats(query, { actor })
      return { success: true, data, error: null }
    } catch (err) {
      if (err instanceof reportsService.InsufficientRoleError) {
        set.status = 403
        return { success: false, data: null, error: { code: 'FORBIDDEN', message: err.message } }
      }
      throw err
    }
  }, { query: t.Object({
    startDate: t.Optional(t.String()),
    endDate: t.Optional(t.String()),
    branchKey: t.Optional(t.String({ maxLength: 128 })),
  }) })
