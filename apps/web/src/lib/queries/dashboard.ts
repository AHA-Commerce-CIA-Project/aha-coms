import { createQuery } from '@tanstack/svelte-query'
import { api } from '$lib/api'

export function dashboardQuery() {
  return createQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data, error } = await api.api.v1.dashboard.get()
      if (error) throw error
      return data
    },
  })
}
