<script lang="ts">
  import { dashboardQuery } from '$lib/queries/dashboard'
  import AppCard from '$lib/components/app-card.svelte'

  const query = dashboardQuery()
</script>

<div class="mb-6">
  <h1 class="text-fluid-title text-foreground">Dashboard</h1>
  <p class="mt-1 text-sm text-muted-foreground">Your accessible applications</p>
</div>

{#if $query.isLoading}
  <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
    {#each Array(4) as _}
      <div class="h-40 animate-pulse rounded-xl bg-muted"></div>
    {/each}
  </div>
{:else if $query.data && $query.data.length > 0}
  <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
    {#each $query.data as app (app.id)}
      <AppCard {app} />
    {/each}
  </div>
{:else}
  <div class="flex flex-col items-center justify-center py-20 text-center">
    <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
      <span class="text-2xl">🔲</span>
    </div>
    <p class="text-sm font-medium text-foreground">No applications assigned</p>
    <p class="mt-1 text-xs text-muted-foreground">Contact your administrator to get access.</p>
  </div>
{/if}
