<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query'
  import { api } from '$lib/api'
  import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Button } from '@coms-portal/ui-svelte/primitives'

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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Action</TableHead>
          <TableHead>Target Type</TableHead>
          <TableHead>Target ID</TableHead>
          <TableHead>Actor</TableHead>
          <TableHead>Timestamp</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {#each ($query.data.entries ?? $query.data) as entry}
          <TableRow>
            <TableCell>
              <span class="rounded-full bg-muted px-2 py-0.5 text-xs font-mono">{entry.action}</span>
            </TableCell>
            <TableCell class="text-muted-foreground">{entry.targetType ?? '-'}</TableCell>
            <TableCell class="font-mono text-xs text-muted-foreground">{entry.targetId ?? '-'}</TableCell>
            <TableCell>
              <p class="text-sm">{entry.actor?.name ?? '-'}</p>
              {#if entry.actor?.email}
                <p class="text-xs text-muted-foreground">{entry.actor.email}</p>
              {/if}
            </TableCell>
            <TableCell class="text-xs text-muted-foreground">
              {new Date(entry.createdAt).toLocaleString()}
            </TableCell>
          </TableRow>
        {/each}
      </TableBody>
    </Table>

    {#if ($query.data.entries ?? $query.data).length === 0}
      <p class="mt-4 text-sm text-muted-foreground">No audit entries found.</p>
    {/if}

    <div class="mt-4 flex items-center justify-between text-xs text-muted-foreground">
      {#if $query.data.total}
        <span>{$query.data.total} total</span>
      {:else}
        <span></span>
      {/if}
      <div class="flex gap-2 items-center">
        <Button
          variant="ghost"
          size="sm"
          onclick={() => page = Math.max(1, page - 1)}
          disabled={page === 1}
        >
          Prev
        </Button>
        <span>Page {page}</span>
        <Button
          variant="ghost"
          size="sm"
          onclick={() => page++}
          disabled={($query.data.entries ?? $query.data).length < limit}
        >
          Next
        </Button>
      </div>
    </div>
  {:else if $query.error}
    <p class="text-sm text-destructive">Failed to load audit log.</p>
  {/if}
</div>
