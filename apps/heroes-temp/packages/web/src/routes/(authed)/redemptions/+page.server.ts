import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  const actor = locals.user!
  const redemptionsService = await import('@coms/server/services/redemptions')
  const result = await redemptionsService.listRedemptions(
    { page: 1, limit: 50, mine: true },
    { actor },
  )
  return {
    redemptions: {
      data: result.redemptions.map((r) => ({
        ...r,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        rewardImageUrl: (r as typeof r & { rewardImageUrl?: string | null }).rewardImageUrl ?? null,
        approverName: (r as typeof r & { approverName?: string | null }).approverName ?? null,
      })),
      meta: result.meta,
    },
  }
}
