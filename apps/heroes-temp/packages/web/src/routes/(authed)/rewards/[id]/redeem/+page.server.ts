import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, params }) => {
  const actor = locals.user!
  const rewardsService = await import('@coms/server/services/rewards')
  try {
    const reward = await rewardsService.getRewardById(params.id, { actor })
    return { reward }
  } catch {
    error(404, 'Reward not found')
  }
}
