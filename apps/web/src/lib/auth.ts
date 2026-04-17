import { api } from '$lib/api'
import type { PortalRole } from '@coms-portal/shared'

export interface SessionUser {
  id: string
  email: string
  name: string
  portalRole: PortalRole
  apps: string[]
}

export async function fetchMe(): Promise<SessionUser | null> {
  try {
    const { data, error } = await api.api.auth.me.get()
    if (error) return null
    return data as SessionUser
  } catch {
    return null
  }
}
