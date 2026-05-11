import { Elysia } from 'elysia'
import * as dashboardService from '../services/dashboard'
import type { AuthUser } from '../middleware/auth'

type Ctx = { authUser: AuthUser }

export const dashboardRoute = new Elysia({ prefix: '/dashboard' })

  // GET /dashboard/summary — current user's summary stats
  .get('/summary', async (c) => {
    const { authUser: actor } = c as unknown as Ctx

    const data = await dashboardService.getSummary({ actor })

    return { success: true, data, error: null }
  })

  // GET /dashboard/activity — recent activity in branch
  .get('/activity', async (c) => {
    const { authUser: actor } = c as unknown as Ctx

    const data = await dashboardService.getRecentActivity({ actor })

    return { success: true, data, error: null }
  })
