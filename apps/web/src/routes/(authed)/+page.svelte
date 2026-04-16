<script lang="ts">
  import { dashboardQuery } from '$lib/queries/dashboard'
  import AppCard from '$lib/components/app-card.svelte'

  const query = dashboardQuery()
</script>

<div class="p-8">
  <div class="mb-8">
    <h1 class="text-xl font-semibold">Dashboard</h1>
    <p class="mt-1 text-sm text-neutral-400">Your accessible applications</p>
  </div>

  {#if $query.isLoading}
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {#each Array(4) as _}
        <div class="h-40 animate-pulse rounded-xl bg-neutral-800"></div>
      {/each}
    </div>
  {:else if $query.data && $query.data.length > 0}
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {#each $query.data as app}
        <AppCard {app} />
      {/each}
    </div>
  {:else}
    <p class="text-sm text-neutral-500">No applications assigned yet.</p>
  {/if}
</div>
