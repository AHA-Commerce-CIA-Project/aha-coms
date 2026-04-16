import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query'
import { api } from '$lib/api'

export function teamsQuery() {
  return createQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data, error } = await api.api.v1.teams.get()
      if (error) throw error
      return data
    },
  })
}

export function teamQuery(id: string) {
  return createQuery({
    queryKey: ['teams', id],
    queryFn: async () => {
      const { data, error } = await (api.api.v1.teams as any)[id].get()
      if (error) throw error
      return data
    },
  })
}

export function createTeamMutation() {
  const queryClient = useQueryClient()
  return createMutation({
    mutationFn: async (body: { name: string; description?: string }) => {
      const { data, error } = await api.api.v1.teams.post(body)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
    },
  })
}
