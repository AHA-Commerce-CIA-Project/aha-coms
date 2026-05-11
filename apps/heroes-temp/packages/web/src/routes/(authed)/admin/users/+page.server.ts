import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, fetch }) => {
  if (locals.user?.role !== 'admin' && locals.user?.role !== 'hr') {
    redirect(302, '/dashboard')
  }

  const res = await fetch('/api/v1/users?limit=100')
  const json = await res.json()

  return {
    users: (json.data ?? []) as Array<{
      id: string
      name: string
      email: string
      role: string
      teamId: string | null
      teamName: string | null
      isActive: boolean
    }>,
    meta: json.meta ?? { total: 0, page: 1, limit: 100 },
  }
}
