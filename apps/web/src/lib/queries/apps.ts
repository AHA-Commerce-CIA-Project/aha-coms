import { createQuery } from '@tanstack/svelte-query'
import { api } from '$lib/api'

export function appsQuery() {
  return createQuery({
    queryKey: ['apps'],
    queryFn: async () => {
      const { data, error } = await api.api.v1.apps.get()
      if (error) throw error
      return data
    },
  })
}
