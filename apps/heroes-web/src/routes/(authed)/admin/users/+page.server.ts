import { redirect } from '@sveltejs/kit'
import { base } from '$app/paths'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user?.role !== 'admin' && locals.user?.role !== 'hr') {
    redirect(302, `${base}/dashboard`)
  }
  const actor = locals.user!
  const usersService = await import('@coms-portal/heroes-api/services/users')
  const result = await usersService.listUsers({ page: 1, limit: 100 }, { actor })
  return { users: result.users, meta: result.meta }
}
