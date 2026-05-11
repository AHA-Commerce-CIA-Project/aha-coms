import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  const actor = locals.user!
  const teamsService = await import('@coms/server/services/teams')
  const result = await teamsService.listTeams({ page: 1, limit: 100 }, { actor })
  return {
    teams: { data: result.teams, meta: result.meta },
  }
}
