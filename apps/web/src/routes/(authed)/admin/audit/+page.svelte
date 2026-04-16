<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query'
  import { api } from '$lib/api'

  let page = $state(1)
  const limit = 20

  const query = $derived(
    createQuery({
      queryKey: ['audit', page],
      queryFn: async () => {
        const { data, error } = await api.api.v1.access.audit.get({
          query: { page: String(page), limit: String(limit) },
        })
        if (error) throw error
        return data
      },
    })
  )
</script>

<div class="p-8">
  <div class="mb-6">
    <h1 class="text-xl font-semibold">Audit Log</h1>
    <p class="mt-1 text-sm text-neutral-400">Record of all access and admin actions</p>
  </div>

  {#if $query.isLoading}
    <div class="animate-pulse space-y-2">
      {#each Array(8) as _}
        <div class="h-12 rounded-lg bg-neutral-800"></div>
      {/each}
    </div>
  {:else if $query.data}
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-neutral-800 text-left text-xs text-neutral-400">
          <th class="pb-2 font-medium">Action</th>
          <th class="pb-2 font-medium">Target Type</th>
          <th class="pb-2 font-medium">Target ID</th>
          <th class="pb-2 font-medium">Actor</th>
          <th class="pb-2 font-medium">Timestamp</th>
        </tr>
      </thead>
      <tbody>
        {#each ($query.data.entries ?? $query.data) as entry}
          <tr class="border-b border-neutral-800/50 hover:bg-neutral-900">
            <td class="py-2">
              <span class="rounded-full bg-neutral-800 px-2 py-0.5 text-xs font-mono">{entry.action}</span>
            </td>
            <td class="py-2 text-neutral-400">{entry.targetType ?? '-'}</td>
            <td class="py-2 font-mono text-xs text-neutral-500">{entry.targetId ?? '-'}</td>
            <td class="py-2">
              <p class="text-sm">{entry.actorName ?? entry.actorId ?? '-'}</p>
              {#if entry.actorEmail}
                <p class="text-xs text-neutral-500">{entry.actorEmail}</p>
              {/if}
            </td>
            <td class="py-2 text-xs text-neutral-400">
              {new Date(entry.createdAt ?? entry.timestamp).toLocaleString()}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    {#if ($query.data.entries ?? $query.data).length === 0}
      <p class="mt-4 text-sm text-neutral-500">No audit entries found.</p>
    {/if}

    <div class="mt-4 flex items-center justify-between text-xs text-neutral-500">
      {#if $query.data.total}
        <span>{$query.data.total} total</span>
      {:else}
        <span></span>
      {/if}
      <div class="flex gap-2">
        <button
          onclick={() => page = Math.max(1, page - 1)}
          disabled={page === 1}
          class="rounded px-2 py-1 hover:bg-neutral-800 disabled:opacity-30"
        >
          Prev
        </button>
        <span>Page {page}</span>
        <button
          onclick={() => page++}
          disabled={($query.data.entries ?? $query.data).length < limit}
          class="rounded px-2 py-1 hover:bg-neutral-800 disabled:opacity-30"
        >
          Next
        </button>
      </div>
    </div>
  {:else if $query.error}
    <p class="text-sm text-red-400">Failed to load audit log.</p>
  {/if}
</div>
