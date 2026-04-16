<script lang="ts">
  import { appsQuery } from '$lib/queries/apps'

  const query = appsQuery()
</script>

<div class="p-8">
  <div class="mb-6 flex items-center justify-between">
    <h1 class="text-xl font-semibold">App Registry</h1>
  </div>

  {#if $query.isLoading}
    <div class="animate-pulse space-y-2">
      {#each Array(4) as _}
        <div class="h-12 rounded-lg bg-neutral-800"></div>
      {/each}
    </div>
  {:else if $query.data}
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-neutral-800 text-left text-xs text-neutral-400">
          <th class="pb-2 font-medium">Name</th>
          <th class="pb-2 font-medium">Slug</th>
          <th class="pb-2 font-medium">URL</th>
          <th class="pb-2 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {#each $query.data as app}
          <tr class="border-b border-neutral-800/50 hover:bg-neutral-900">
            <td class="py-2">
              <a href="/admin/apps/{app.id}" class="text-indigo-400 hover:text-indigo-300">{app.name}</a>
            </td>
            <td class="py-2 text-neutral-400">{app.slug}</td>
            <td class="py-2 text-neutral-400">{app.url}</td>
            <td class="py-2">
              <span
                class="text-xs"
                class:text-green-400={app.status === 'active'}
                class:text-red-400={app.status !== 'active'}
              >
                {app.status}
              </span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if $query.data.length === 0}
      <p class="mt-4 text-sm text-neutral-500">No apps registered.</p>
    {/if}
  {:else if $query.error}
    <p class="text-sm text-red-400">Failed to load apps.</p>
  {/if}
</div>
