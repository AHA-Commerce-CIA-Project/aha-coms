import { createQuery } from '@tanstack/svelte-query'
import { adminApi } from '$lib/admin-api'

export function webhooksQuery(appId: string) {
  return createQuery({
    queryKey: ['webhooks', appId],
    queryFn: () => adminApi.listWebhooks(appId),
  })
}
