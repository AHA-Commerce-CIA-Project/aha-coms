import { redirect } from '@sveltejs/kit'
import { base } from '$app/paths'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user?.role !== 'admin') {
    redirect(302, `${base}/dashboard`)
  }

  const scheduler = await import('@coms-portal/heroes-api/services/sheet-sync-scheduler')
  const repo = await import('@coms-portal/heroes-api/repositories/sheet-sync')

  await scheduler.cleanupStaleJobs()
  const [isRunning, lastJob, listResult] = await Promise.all([
    scheduler.isSyncRunning(),
    repo.getLatestJob(),
    repo.listJobs({ page: 1, limit: 20 }),
  ])

  return {
    status: { isRunning, lastJob, schedule: 'manual' },
    jobs: listResult.jobs,
    meta: listResult.meta,
  }
}
