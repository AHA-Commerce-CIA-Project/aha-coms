import type { PageServerLoad } from './$types'
import type { PointCategoryCode, PointStatus } from '@coms/shared/constants'

export const load: PageServerLoad = async ({ locals, url }) => {
  const actor = locals.user!
  const page = Number(url.searchParams.get('page') ?? '1')
  const status = url.searchParams.get('status') ?? undefined
  const category = url.searchParams.get('category') ?? undefined

  const pointsService = await import('@coms/server/services/points')
  const result = await pointsService.listPoints(
    {
      page,
      limit: 20,
      ...(status ? { status: status as PointStatus } : {}),
      ...(category ? { categoryCode: category as PointCategoryCode } : {}),
    },
    { actor },
  )

  return {
    points: result.points.map((p) => ({
      ...p,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
      category: { code: (p as typeof p & { categoryCode?: string }).categoryCode ?? '' },
      user: { name: (p as typeof p & { userName?: string }).userName ?? '' },
    })),
    meta: { ...result.meta, page },
    status: status ?? '',
    category: category ?? '',
  }
}
