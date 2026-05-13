<script lang="ts">
  import { base } from '$app/paths'
  import { teamsQuery } from '$lib/queries/teams'
  import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Button } from '@coms-portal/ui-svelte/primitives'

  const query = teamsQuery()
</script>

<div class="p-8">
  <div class="mb-6 flex items-center justify-between">
    <h1 class="text-xl font-semibold">Teams</h1>
    <Button href="{base}/admin/teams/new">New Team</Button>
  </div>

  {#if $query.isLoading}
    <div class="animate-pulse space-y-2">
      {#each Array(5) as _}
        <div class="h-12 rounded-lg bg-muted"></div>
      {/each}
    </div>
  {:else if $query.data}
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Members</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {#each $query.data as team}
          <TableRow>
            <TableCell>
              <a href="{base}/admin/teams/{team.id}" class="text-primary hover:text-primary/80">{team.name}</a>
            </TableCell>
            <TableCell class="text-muted-foreground">{team.description ?? '-'}</TableCell>
            <TableCell class="text-muted-foreground">{team.memberCount ?? 0}</TableCell>
            <TableCell class="text-muted-foreground">{new Date(team.createdAt).toLocaleDateString()}</TableCell>
          </TableRow>
        {/each}
      </TableBody>
    </Table>
    {#if $query.data.length === 0}
      <p class="mt-4 text-sm text-muted-foreground">No teams yet.</p>
    {/if}
  {:else if $query.error}
    <p class="text-sm text-destructive">Failed to load teams.</p>
  {/if}
</div>
