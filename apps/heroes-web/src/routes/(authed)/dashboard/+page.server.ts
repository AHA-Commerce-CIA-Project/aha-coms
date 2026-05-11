import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  const actor = locals.user!
  const dashboardService = await import('@coms/server/services/dashboard')
  const leaderboardService = await import('@coms/server/services/leaderboard')
  const [summary, activity, leaderboard] = await Promise.all([
    dashboardService.getSummary({ actor }),
    dashboardService.getRecentActivity({ actor }),
    leaderboardService.getLeaderboard({ type: 'poin_aha', page: 1, limit: 5 }, { actor }),
  ])
  return { summary, activity, leaderboard }
}
