import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query'
import { adminApi } from '$lib/admin-api'

export function teamsQuery() {
  return createQuery({
    queryKey: ['teams'],
    queryFn: () => adminApi.getTeams(),
  })
}

export function teamQuery(id: string) {
  return createQuery({
    queryKey: ['teams', id],
    queryFn: () => adminApi.getTeam(id),
  })
}

export function createTeamMutation() {
  const queryClient = useQueryClient()
  return createMutation({
    mutationFn: (body: { name: string; description?: string }) => adminApi.createTeam(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
    },
  })
}
