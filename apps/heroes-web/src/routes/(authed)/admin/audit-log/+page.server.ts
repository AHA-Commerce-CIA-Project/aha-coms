import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, fetch, url }) => {
  if (locals.user?.role !== 'admin') {
    redirect(302, '/dashboard')
  }

  const page = url.searchParams.get('page') ?? '1'
  const limit = '50'

  const res = await fetch(`/api/v1/audit-logs?page=${page}&limit=${limit}`)
  const json = await res.json()

  return {
    logs: (json.data ?? []) as Array<{
      id: string
      actorId: string
      actorName: string | null
      action: string
      entityType: string
      entityId: string | null
      createdAt: string
    }>,
    meta: json.meta ?? { total: 0, page: Number(page), limit: Number(limit) },
  }
}
