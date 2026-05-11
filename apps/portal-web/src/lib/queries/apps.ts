import { createQuery } from '@tanstack/svelte-query'
import { adminApi } from '$lib/admin-api'

export function appsQuery() {
  return createQuery({
    queryKey: ['apps'],
    queryFn: () => adminApi.getApps(),
  })
}
