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
    <p class="mt-1 text-sm text-muted-foreground">Record of all access and admin actions</p>
  </div>

  {#if $query.isLoading}
    <div class="animate-pulse space-y-2">
      {#each Array(8) as _}
        <div class="h-12 rounded-lg bg-muted"></div>
      {/each}
    </div>
  {:else if $query.data}
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-border text-left text-xs text-muted-foreground">
          <th class="pb-2 font-medium">Action</th>
          <th class="pb-2 font-medium">Target Type</th>
          <th class="pb-2 font-medium">Target ID</th>
          <th class="pb-2 font-medium">Actor</th>
          <th class="pb-2 font-medium">Timestamp</th>
        </tr>
      </thead>
      <tbody>
        {#each ($query.data.entries ?? $query.data) as entry}
          <tr class="border-b border-border/50 hover:bg-accent">
            <td class="py-2">
              <span class="rounded-full bg-muted px-2 py-0.5 text-xs font-mono">{entry.action}</span>
            </td>
            <td class="py-2 text-muted-foreground">{entry.targetType ?? '-'}</td>
            <td class="py-2 font-mono text-xs text-muted-foreground">{entry.targetId ?? '-'}</td>
            <td class="py-2">
              <p class="text-sm">{entry.actor?.name ?? '-'}</p>
              {#if entry.actor?.email}
                <p class="text-xs text-muted-foreground">{entry.actor.email}</p>
              {/if}
            </td>
            <td class="py-2 text-xs text-muted-foreground">
              {new Date(entry.createdAt).toLocaleString()}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    {#if ($query.data.entries ?? $query.data).length === 0}
      <p class="mt-4 text-sm text-muted-foreground">No audit entries found.</p>
    {/if}

    <div class="mt-4 flex items-center justify-between text-xs text-muted-foreground">
      {#if $query.data.total}
        <span>{$query.data.total} total</span>
      {:else}
        <span></span>
      {/if}
      <div class="flex gap-2">
        <button
          onclick={() => page = Math.max(1, page - 1)}
          disabled={page === 1}
          class="rounded px-2 py-1 hover:bg-accent disabled:opacity-30"
        >
          Prev
        </button>
        <span>Page {page}</span>
        <button
          onclick={() => page++}
          disabled={($query.data.entries ?? $query.data).length < limit}
          class="rounded px-2 py-1 hover:bg-accent disabled:opacity-30"
        >
          Next
        </button>
      </div>
    </div>
  {:else if $query.error}
    <p class="text-sm text-destructive">Failed to load audit log.</p>
  {/if}
</div>
