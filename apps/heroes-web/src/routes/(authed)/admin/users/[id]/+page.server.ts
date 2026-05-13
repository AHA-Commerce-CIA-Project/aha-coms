import { redirect, error } from '@sveltejs/kit'
import { base } from '$app/paths'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, params }) => {
  if (locals.user?.role !== 'admin' && locals.user?.role !== 'hr') {
    redirect(302, `${base}/dashboard`)
  }
  const actor = locals.user!
  const usersService = await import('@coms-portal/heroes-api/services/users')
  try {
    const user = await usersService.getUserById(params.id, { actor })
    return { user }
  } catch (err) {
    if (err instanceof usersService.UserNotFoundError) {
      error(404, 'User not found')
    }
    throw err
  }
}
