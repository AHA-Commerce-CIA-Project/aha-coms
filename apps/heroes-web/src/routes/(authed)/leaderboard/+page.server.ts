import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, url }) => {
  const actor = locals.user!
  const months = url.searchParams.get('months') ?? ''
  const type = (url.searchParams.get('type') ?? 'bintang') as 'bintang' | 'poin_aha' | 'penalti'

  const leaderboardService = await import('@coms/server/services/leaderboard')
  const result = await leaderboardService.getLeaderboard(
    {
      type,
      ...(months ? { months: Number(months) } : {}),
      page: 1,
      limit: 50,
    },
    { actor },
  )

  return {
    leaderboard: { data: result.entries, meta: result.meta },
    months,
    type,
  }
}
