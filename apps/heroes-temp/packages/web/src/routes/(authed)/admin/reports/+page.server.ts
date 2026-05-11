import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, fetch }) => {
  if (locals.user?.role !== 'admin' && locals.user?.role !== 'hr') {
    redirect(302, '/dashboard')
  }

  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const res = await fetch(
    `/api/v1/reports?startDate=${thirtyDaysAgo}&endDate=${today}`,
  )
  const json = await res.json()

  return {
    reports: (json.data ?? json) as {
      totalSubmissions: number
      byCategory: Array<{ name: string; count: number }>
      byTeam: Array<{ name: string; total: number }>
      overTime: Array<{ date: string; count: number }>
    },
    defaultStart: thirtyDaysAgo,
    defaultEnd: today,
  }
}
