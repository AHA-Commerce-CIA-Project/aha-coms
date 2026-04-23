<script lang="ts">
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { teamQuery } from '$lib/queries/teams'
  import { appsQuery } from '$lib/queries/apps'
  import { adminApi } from '$lib/admin-api'
  import { useQueryClient } from '@tanstack/svelte-query'

  const id = $derived($page.params.id!)
  const query = $derived(teamQuery(id))
  const allAppsQuery = appsQuery()
  const queryClient = useQueryClient()

  // Edit team state
  let editing = $state(false)
  let editName = $state('')
  let editDescription = $state('')
  let editError = $state<string | null>(null)
  let editPending = $state(false)

  // Add member state
  let addMemberUserId = $state('')
  let addMemberRole = $state('member')
  let addMemberError = $state<string | null>(null)
  let addMemberPending = $state(false)

  // Grant app state
  let grantAppId = $state('')
  let grantAppRole = $state('')
  let grantAppError = $state<string | null>(null)
  let grantAppPending = $state(false)

  // Derive the selected app's declared roles
  const selectedAppRoles = $derived(
    $allAppsQuery.data?.find((a) => a.id === grantAppId)?.appRoles ?? [],
  )

  // Auto-select the default role when app selection changes
  $effect(() => {
    const defaultRole = selectedAppRoles.find((r) => r.default)
    grantAppRole = defaultRole?.key ?? (selectedAppRoles[0]?.key ?? '')
  })
  let actionError = $state<string | null>(null)
  let pendingMemberRemovalId = $state<string | null>(null)
  let confirmingMemberRemovalId = $state<string | null>(null)
  let pendingRevokeAppId = $state<string | null>(null)
  let confirmingRevokeAppId = $state<string | null>(null)
  let deletePending = $state(false)
  let confirmingDelete = $state(false)

  function startEdit() {
    const team = $query.data
    if (!team) return
    editName = team.name
    editDescription = team.description ?? ''
    editError = null
    editing = true
  }

  async function handleSaveEdit(e: SubmitEvent) {
    e.preventDefault()
    editError = null
    editPending = true
    try {
      await adminApi.updateTeam(id, {
        name: editName,
        description: editDescription || undefined,
      })
      queryClient.invalidateQueries({ queryKey: ['teams', id] })
      editing = false
    } catch (e) {
      editError = e instanceof Error ? e.message : 'Failed to update team'
    } finally {
      editPending = false
    }
  }

  async function handleAddMember(e: SubmitEvent) {
    e.preventDefault()
    addMemberError = null
    addMemberPending = true
    try {
      await adminApi.addTeamMember(id, {
        userId: addMemberUserId,
        roleInTeam: addMemberRole,
      })
      addMemberUserId = ''
      addMemberRole = 'member'
      queryClient.invalidateQueries({ queryKey: ['teams', id] })
    } catch (e) {
      addMemberError = e instanceof Error ? e.message : 'Failed to add member'
    } finally {
      addMemberPending = false
    }
  }

  async function handleRemoveMember(userId: string) {
    actionError = null
    pendingMemberRemovalId = userId
    try {
      await adminApi.removeTeamMember(id, userId)
      confirmingMemberRemovalId = null
      queryClient.invalidateQueries({ queryKey: ['teams', id] })
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to remove member'
    } finally {
      pendingMemberRemovalId = null
    }
  }

  async function handleGrantApp(e: SubmitEvent) {
    e.preventDefault()
    grantAppError = null
    grantAppPending = true
    try {
      await adminApi.grantTeamApp(id, {
        appId: grantAppId,
        appRole: grantAppRole || undefined,
      })
      grantAppId = ''
      grantAppRole = ''
      queryClient.invalidateQueries({ queryKey: ['teams', id] })
    } catch (e) {
      grantAppError = e instanceof Error ? e.message : 'Failed to grant app'
    } finally {
      grantAppPending = false
    }
  }

  async function handleRevokeApp(appId: string) {
    actionError = null
    pendingRevokeAppId = appId
    try {
      await adminApi.revokeTeamApp(id, appId)
      confirmingRevokeAppId = null
      queryClient.invalidateQueries({ queryKey: ['teams', id] })
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to revoke app'
    } finally {
      pendingRevokeAppId = null
    }
  }

  async function handleDeleteTeam() {
    actionError = null
    deletePending = true
    try {
      await adminApi.deleteTeam(id)
      await queryClient.invalidateQueries({ queryKey: ['teams'] })
      await goto('/admin/teams')
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to delete team'
    } finally {
      deletePending = false
    }
  }
</script>

<div class="p-8">
  {#if $query.isLoading}
    <div class="animate-pulse space-y-4">
      <div class="h-8 w-48 rounded bg-muted"></div>
      <div class="h-64 rounded-xl bg-muted"></div>
    </div>
  {:else if $query.data}
    {@const team = $query.data}

    <!-- Header -->
    <div class="mb-6 flex items-start justify-between">
      <div>
        {#if editing}
          <form onsubmit={handleSaveEdit} class="space-y-3">
            <div>
              <input
                type="text"
                bind:value={editName}
                required
                class="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none"
              />
            </div>
            <div>
              <input
                type="text"
                bind:value={editDescription}
                placeholder="Description"
                class="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none"
              />
            </div>
            {#if editError}
              <p class="text-xs text-destructive">{editError}</p>
            {/if}
            <div class="flex gap-2">
              <button type="submit" disabled={editPending} class="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50">Save</button>
              <button type="button" onclick={() => editing = false} class="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent">Cancel</button>
            </div>
          </form>
        {:else}
          <h1 class="text-xl font-semibold">{team.name}</h1>
          {#if team.description}
            <p class="mt-1 text-sm text-muted-foreground">{team.description}</p>
          {/if}
        {/if}
      </div>
      <div class="flex gap-2">
        {#if !editing}
          <button onclick={startEdit} class="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent">Edit</button>
        {/if}
        {#if confirmingDelete}
          <button
            onclick={handleDeleteTeam}
            disabled={deletePending}
            class="rounded-lg border border-destructive/50 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            {deletePending ? 'Deleting…' : 'Confirm Delete'}
          </button>
          <button
            onclick={() => {
              confirmingDelete = false
              actionError = null
            }}
            class="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent"
          >
            Cancel
          </button>
        {:else}
          <button
            onclick={() => {
              confirmingDelete = true
              actionError = null
            }}
            class="rounded-lg border border-destructive/50 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
          >
            Delete
          </button>
        {/if}
      </div>
    </div>

    {#if actionError}
      <p class="mb-4 text-sm text-destructive">{actionError}</p>
    {/if}

    <div class="grid gap-6 lg:grid-cols-2">
      <!-- Members -->
      <div class="rounded-xl border border-border bg-card p-5">
        <h2 class="mb-4 text-sm font-semibold">Members</h2>

        {#if team.members && team.members.length > 0}
          <div class="mb-4 space-y-1">
            {#each team.members as member}
              <div class="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-accent">
                <div>
                  <p class="text-sm">{member.name ?? member.userId}</p>
                  <p class="text-xs text-muted-foreground">{member.email ?? ''} &middot; {member.roleInTeam}</p>
                </div>
                <button
                  onclick={() => {
                    if (confirmingMemberRemovalId === member.userId) {
                      handleRemoveMember(member.userId)
                    } else {
                      confirmingMemberRemovalId = member.userId
                      actionError = null
                    }
                  }}
                  disabled={pendingMemberRemovalId === member.userId}
                  class="rounded px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10"
                >
                  {#if pendingMemberRemovalId === member.userId}
                    Removing…
                  {:else if confirmingMemberRemovalId === member.userId}
                    Confirm Remove
                  {:else}
                    Remove
                  {/if}
                </button>
              </div>
            {/each}
          </div>
        {:else}
          <p class="mb-4 text-xs text-muted-foreground">No members yet.</p>
        {/if}

        <!-- Add member form -->
        <form onsubmit={handleAddMember} class="space-y-2 border-t border-border pt-4">
          <p class="text-xs font-medium text-muted-foreground">Add Member</p>
          <input
            type="text"
            bind:value={addMemberUserId}
            placeholder="User ID"
            required
            class="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
          <select
            bind:value={addMemberRole}
            class="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm focus:border-ring focus:outline-none"
          >
            <option value="member">Member</option>
            <option value="lead">Lead</option>
          </select>
          {#if addMemberError}
            <p class="text-xs text-destructive">{addMemberError}</p>
          {/if}
          <button
            type="submit"
            disabled={addMemberPending}
            class="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            Add
          </button>
        </form>
      </div>

      <!-- App Access -->
      <div class="rounded-xl border border-border bg-card p-5">
        <h2 class="mb-4 text-sm font-semibold">App Access</h2>

        {#if team.apps && team.apps.length > 0}
          <div class="mb-4 space-y-1">
            {#each team.apps as app}
              <div class="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-accent">
                <div>
                  <p class="text-sm">{app.name ?? app.appId}</p>
                  <p class="text-xs text-muted-foreground">{app.slug ?? ''}</p>
                </div>
                <button
                  onclick={() => {
                    if (confirmingRevokeAppId === app.appId) {
                      handleRevokeApp(app.appId)
                    } else {
                      confirmingRevokeAppId = app.appId
                      actionError = null
                    }
                  }}
                  disabled={pendingRevokeAppId === app.appId}
                  class="rounded px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10"
                >
                  {#if pendingRevokeAppId === app.appId}
                    Revoking…
                  {:else if confirmingRevokeAppId === app.appId}
                    Confirm Revoke
                  {:else}
                    Revoke
                  {/if}
                </button>
              </div>
            {/each}
          </div>
        {:else}
          <p class="mb-4 text-xs text-muted-foreground">No app access granted.</p>
        {/if}

        <!-- Grant app form -->
        <form onsubmit={handleGrantApp} class="space-y-2 border-t border-border pt-4">
          <p class="text-xs font-medium text-muted-foreground">Grant App Access</p>
          <select
            bind:value={grantAppId}
            required
            class="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm focus:border-ring focus:outline-none"
          >
            <option value="" disabled>Select an app</option>
            {#if $allAppsQuery.data}
              {#each $allAppsQuery.data as app}
                <option value={app.id}>{app.name} ({app.slug})</option>
              {/each}
            {/if}
          </select>
          {#if selectedAppRoles.length > 0}
            <select
              bind:value={grantAppRole}
              class="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm focus:border-ring focus:outline-none"
            >
              {#each selectedAppRoles as role}
                <option value={role.key}>{role.label}</option>
              {/each}
            </select>
          {/if}
          {#if grantAppError}
            <p class="text-xs text-destructive">{grantAppError}</p>
          {/if}
          <button
            type="submit"
            disabled={grantAppPending}
            class="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            Grant
          </button>
        </form>
      </div>
    </div>
  {:else if $query.error}
    <p class="text-sm text-destructive">Failed to load team.</p>
  {/if}

  <a href="/admin/teams" class="mt-6 inline-block text-xs text-primary hover:text-primary/80">&larr; Back to teams</a>
</div>
