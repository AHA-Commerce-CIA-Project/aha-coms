import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, fetch }) => {
  if (locals.user?.role !== 'admin') {
    redirect(302, '/dashboard')
  }

  const res = await fetch('/api/v1/settings')
  const json = await res.json()

  return {
    settings: (json.data ?? []) as Array<{
      key: string
      value: string
      description: string | null
      updatedAt: string
    }>,
  }
}
