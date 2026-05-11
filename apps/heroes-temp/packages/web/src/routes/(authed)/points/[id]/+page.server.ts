import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, params }) => {
  const actor = locals.user!
  const [pointsService, challengesService, appealsService] = await Promise.all([
    import('@coms/server/services/points'),
    import('@coms/server/services/challenges'),
    import('@coms/server/services/appeals'),
  ])

  let point
  try {
    point = await pointsService.getPointById(params.id, { actor })
  } catch {
    error(404, 'Point not found')
  }

  const [challengesResult, appealsResult] = await Promise.all([
    challengesService.listChallenges(params.id, { page: 1, limit: 100 }, { actor }),
    appealsService.listAppeals(params.id, { page: 1, limit: 100 }, { actor }),
  ])

  return {
    point: point
      ? {
          ...point,
          createdAt:
            point.createdAt instanceof Date ? point.createdAt.toISOString() : point.createdAt,
        }
      : point,
    challenges: challengesResult.challenges.map((c) => ({
      ...c,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
      resolvedAt: c.resolvedAt instanceof Date ? c.resolvedAt.toISOString() : c.resolvedAt,
    })),
    appeals: appealsResult.appeals.map((a) => ({
      ...a,
      createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
      resolvedAt: a.resolvedAt instanceof Date ? a.resolvedAt.toISOString() : a.resolvedAt,
    })),
  }
}
