import { redirect } from '@sveltejs/kit'
import { base } from '$app/paths'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user?.role !== 'admin') {
    redirect(302, `${base}/dashboard`)
  }
  const actor = locals.user!
  const settingsService = await import('@coms-portal/heroes-api/services/settings')
  const settings = await settingsService.listSettings({ actor })
  return { settings }
}
