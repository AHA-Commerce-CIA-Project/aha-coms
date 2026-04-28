import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query'
import { adminApi } from '$lib/admin-api'

export function createAliasQueueQuery() {
  return createQuery({
    queryKey: ['alias-queue'],
    queryFn: () => adminApi.listAliasQueue(),
  })
}

export function createResolveAliasMutation() {
  const queryClient = useQueryClient()
  return createMutation({
    mutationFn: ({ id, identityUserId }: { id: string; identityUserId: string }) =>
      adminApi.resolveAliasQueue(id, { identityUserId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alias-queue'] })
    },
  })
}

export function createRejectAliasMutation() {
  const queryClient = useQueryClient()
  return createMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi.rejectAliasQueue(id, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alias-queue'] })
    },
  })
}
