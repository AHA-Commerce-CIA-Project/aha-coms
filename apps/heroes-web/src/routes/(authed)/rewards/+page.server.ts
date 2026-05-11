import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  const actor = locals.user!
  const rewardsService = await import('@coms/server/services/rewards')
  const result = await rewardsService.listRewards({ page: 1, limit: 100 }, { actor })
  return {
    rewards: { data: result.rewards, meta: result.meta },
  }
}
