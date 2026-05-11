import { redirect, error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, fetch, params }) => {
  if (locals.user?.role !== 'admin' && locals.user?.role !== 'hr') {
    redirect(302, '/dashboard')
  }

  const res = await fetch(`/api/v1/users/${params.id}`)

  if (res.status === 404) {
    error(404, 'User not found')
  }

  if (!res.ok) {
    error(500, 'Failed to load user')
  }

  const json = await res.json()

  return {
    user: json.data as {
      id: string
      name: string
      email: string
      role: string
      teamId: string | null
      teamName: string | null
      department: string | null
      position: string | null
      branchKey: string | null
      isActive: boolean
      createdAt: string
    },
  }
}
