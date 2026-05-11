import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, fetch }) => {
  if (locals.user?.role !== 'admin') {
    redirect(302, '/dashboard')
  }

  const [statusRes, jobsRes] = await Promise.all([
    fetch('/api/v1/sheet-sync/status'),
    fetch('/api/v1/sheet-sync/jobs?limit=20'),
  ])

  const statusJson = await statusRes.json()
  const jobsJson = await jobsRes.json()

  return {
    status: statusJson.data as {
      isRunning: boolean
      lastJob: { id: string; status: string; startedAt: string; finishedAt: string | null; error: string | null } | null
      schedule: string
    } | null,
    jobs: (jobsJson.data ?? []) as Array<{
      id: string
      status: string
      startedAt: string
      finishedAt: string | null
      error: string | null
      rowsProcessed: number | null
    }>,
    meta: jobsJson.meta ?? { total: 0, page: 1, limit: 20 },
  }
}
