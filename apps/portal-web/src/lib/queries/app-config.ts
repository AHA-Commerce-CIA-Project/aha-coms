import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query'
import { browser } from '$app/environment'
import { adminApi } from '$lib/admin-api'

export function createAppConfigQuery(appId: string, filter: string) {
  return createQuery({
    queryKey: ['app-config', appId, filter],
    queryFn: () => adminApi.listAppConfig(appId, filter),
    // AND with `browser` so the per-query override doesn't shadow the
    // global "no SSR" rule set on QueryClient defaults.
    enabled: browser && !!appId,
  })
}

export function createManifestsQuery() {
  return createQuery({
    queryKey: ['app-config-manifests'],
    queryFn: () => adminApi.listAppConfig('', ''),
  })
}

export function createSingleAppConfigMutation() {
  const queryClient = useQueryClient()
  return createMutation({
    mutationFn: (body: { appId: string; portalSub: string; config: Record<string, unknown> }) =>
      adminApi.updateSingleAppConfig(body),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['app-config', vars.appId] })
    },
  })
}

export function createBulkPreviewMutation() {
  return createMutation({
    mutationFn: (body: { appId: string; rows: Array<{ portalSub: string; config: Record<string, unknown> }> }) =>
      adminApi.bulkPreviewAppConfig(body),
  })
}

export function createBulkCommitMutation() {
  const queryClient = useQueryClient()
  return createMutation({
    mutationFn: (body: { appId: string; rows: Array<{ portalSub: string; config: Record<string, unknown> }> }) =>
      adminApi.bulkCommitAppConfig(body),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['app-config', vars.appId] })
    },
  })
}
