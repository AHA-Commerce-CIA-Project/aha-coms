<script lang="ts">
  import { createQuery, useQueryClient } from '@tanstack/svelte-query'
  import { api } from '$lib/api'

  const queryClient = useQueryClient()

  const statusQuery = createQuery({
    queryKey: ['workspace-sync', 'status'],
    queryFn: async () => {
      const { data, error } = await (api.api.v1 as any)['workspace-sync'].status.get()
      if (error) throw error
      return data
    },
  })

  const historyQuery = createQuery({
    queryKey: ['workspace-sync', 'history'],
    queryFn: async () => {
      const { data, error } = await (api.api.v1 as any)['workspace-sync'].history.get()
      if (error) throw error
      return data
    },
  })

  let syncing = $state(false)
  let syncError = $state<string | null>(null)
  let syncSuccess = $state(false)

  async function handleSyncNow() {
    if (!confirm('Trigger a workspace sync now?')) return
    syncing = true
    syncError = null
    syncSuccess = false
    try {
      const { error } = await (api.api.v1 as any)['workspace-sync'].trigger.post({})
      if (error) throw error
      syncSuccess = true
      queryClient.invalidateQueries({ queryKey: ['workspace-sync'] })
    } catch (e) {
      syncError = e instanceof Error ? e.message : 'Sync failed'
    } finally {
      syncing = false
    }
  }
</script>

<div class="p-8">
  <div class="mb-6 flex items-center justify-between">
    <div>
      <h1 class="text-xl font-semibold">Workspace Sync</h1>
      <p class="mt-1 text-sm text-neutral-400">Google Workspace directory synchronisation</p>
    </div>
    <button
      onclick={handleSyncNow}
      disabled={syncing}
      class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
    >
      {syncing ? 'Syncing...' : 'Sync Now'}
    </button>
  </div>

  {#if syncError}
    <p class="mb-4 text-sm text-red-400">{syncError}</p>
  {/if}
  {#if syncSuccess}
    <p class="mb-4 text-sm text-green-400">Sync triggered successfully.</p>
  {/if}

  <!-- Latest Status -->
  <div class="mb-6 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
    <h2 class="mb-4 text-sm font-semibold">Latest Sync Status</h2>
    {#if $statusQuery.isLoading}
      <div class="animate-pulse space-y-2">
        <div class="h-5 w-64 rounded bg-neutral-800"></div>
        <div class="h-5 w-48 rounded bg-neutral-800"></div>
      </div>
    {:else if $statusQuery.data}
      {@const status = $statusQuery.data}
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-neutral-400">Status</span>
          <span
            class:text-green-400={status.status === 'success'}
            class:text-yellow-400={status.status === 'running'}
            class:text-red-400={status.status === 'failed'}
          >
            {status.status ?? 'unknown'}
          </span>
        </div>
        {#if status.lastRunAt}
          <div class="flex justify-between">
            <span class="text-neutral-400">Last Run</span>
            <span>{new Date(status.lastRunAt).toLocaleString()}</span>
          </div>
        {/if}
        {#if status.message}
          <div class="flex justify-between">
            <span class="text-neutral-400">Message</span>
            <span class="text-neutral-300">{status.message}</span>
          </div>
        {/if}
      </div>
    {:else}
      <p class="text-xs text-neutral-500">No sync status available.</p>
    {/if}
  </div>

  <!-- History -->
  <div>
    <h2 class="mb-3 text-sm font-semibold">Sync History</h2>
    {#if $historyQuery.isLoading}
      <div class="animate-pulse space-y-2">
        {#each Array(4) as _}
          <div class="h-10 rounded-lg bg-neutral-800"></div>
        {/each}
      </div>
    {:else if $historyQuery.data && $historyQuery.data.length > 0}
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-neutral-800 text-left text-xs text-neutral-400">
            <th class="pb-2 font-medium">Status</th>
            <th class="pb-2 font-medium">Started</th>
            <th class="pb-2 font-medium">Finished</th>
            <th class="pb-2 font-medium">Message</th>
          </tr>
        </thead>
        <tbody>
          {#each $historyQuery.data as run}
            <tr class="border-b border-neutral-800/50 hover:bg-neutral-900">
              <td class="py-2">
                <span
                  class="text-xs"
                  class:text-green-400={run.status === 'success'}
                  class:text-yellow-400={run.status === 'running'}
                  class:text-red-400={run.status === 'failed'}
                >
                  {run.status}
                </span>
              </td>
              <td class="py-2 text-xs text-neutral-400">{run.startedAt ? new Date(run.startedAt).toLocaleString() : '-'}</td>
              <td class="py-2 text-xs text-neutral-400">{run.finishedAt ? new Date(run.finishedAt).toLocaleString() : '-'}</td>
              <td class="py-2 text-xs text-neutral-500">{run.message ?? '-'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="text-sm text-neutral-500">No sync history yet.</p>
    {/if}
  </div>
</div>
