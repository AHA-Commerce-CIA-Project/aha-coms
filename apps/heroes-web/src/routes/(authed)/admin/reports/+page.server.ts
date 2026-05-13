import { redirect } from '@sveltejs/kit'
import { base } from '$app/paths'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user?.role !== 'admin' && locals.user?.role !== 'hr') {
    redirect(302, `${base}/dashboard`)
  }
  const actor = locals.user!
  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const reportsService = await import('@coms-portal/heroes-api/services/reports')
  const reports = await reportsService.getDashboardStats(
    { startDate: thirtyDaysAgo, endDate: today },
    { actor },
  )
  return { reports, defaultStart: thirtyDaysAgo, defaultEnd: today }
}
