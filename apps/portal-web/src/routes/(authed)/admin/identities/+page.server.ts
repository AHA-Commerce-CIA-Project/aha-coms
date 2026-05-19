/**
 * Loader for /admin/identities — Spec 06 PR F admin surface.
 *
 * Lists password-only identities (admin-created credential bags). Workspace
 * and personal-only identities live on /admin/employees instead.
 */
import type { PageServerLoad } from './$types'

export interface IdentitySummary {
  id: string
  name: string
  email: string | null
  gipUid: string | null
  status: string
  notes: string | null
  passwordSetAt: string | null
  createdAt: string
}

export const load: PageServerLoad = async ({ fetch }) => {
  const res = await fetch('/api/v1/identities/')
  if (!res.ok) {
    return { identities: [] as IdentitySummary[], error: `HTTP ${res.status}` as string | null }
  }
  const body = (await res.json()) as { identities: IdentitySummary[] }
  return { identities: body.identities, error: null as string | null }
}
