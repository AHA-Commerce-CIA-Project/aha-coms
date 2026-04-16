<script lang="ts">
  import { teamsQuery } from '$lib/queries/teams'

  const query = teamsQuery()
</script>

<div class="p-8">
  <div class="mb-6 flex items-center justify-between">
    <h1 class="text-xl font-semibold">Teams</h1>
    <a href="/admin/teams/new" class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500">New Team</a>
  </div>

  {#if $query.isLoading}
    <div class="animate-pulse space-y-2">
      {#each Array(5) as _}
        <div class="h-12 rounded-lg bg-neutral-800"></div>
      {/each}
    </div>
  {:else if $query.data}
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-neutral-800 text-left text-xs text-neutral-400">
          <th class="pb-2 font-medium">Name</th>
          <th class="pb-2 font-medium">Description</th>
          <th class="pb-2 font-medium">Members</th>
          <th class="pb-2 font-medium">Created</th>
        </tr>
      </thead>
      <tbody>
        {#each $query.data as team}
          <tr class="border-b border-neutral-800/50 hover:bg-neutral-900">
            <td class="py-2">
              <a href="/admin/teams/{team.id}" class="text-indigo-400 hover:text-indigo-300">{team.name}</a>
            </td>
            <td class="py-2 text-neutral-400">{team.description ?? '-'}</td>
            <td class="py-2 text-neutral-400">{team.memberCount ?? 0}</td>
            <td class="py-2 text-neutral-400">{new Date(team.createdAt).toLocaleDateString()}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if $query.data.length === 0}
      <p class="mt-4 text-sm text-neutral-500">No teams yet.</p>
    {/if}
  {:else if $query.error}
    <p class="text-sm text-red-400">Failed to load teams.</p>
  {/if}
</div>
