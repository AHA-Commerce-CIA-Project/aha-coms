import { redirect } from '@sveltejs/kit'
import { base } from '$app/paths'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, url }) => {
  if (locals.user?.role !== 'admin') {
    redirect(302, `${base}/dashboard`)
  }
  const actor = locals.user!
  const page = Number(url.searchParams.get('page') ?? '1')
  const limit = 50

  const auditLogsService = await import('@coms-portal/heroes-api/services/audit-logs')
  const result = await auditLogsService.listAuditLogs({ page, limit }, { actor })
  return { logs: result.logs, meta: result.meta }
}
