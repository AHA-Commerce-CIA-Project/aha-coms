<script lang="ts">
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { teamQuery } from '$lib/queries/teams'
  import { api } from '$lib/api'
  import { useQueryClient } from '@tanstack/svelte-query'

  const id = $derived($page.params.id)
  const query = $derived(teamQuery(id))
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
  let grantAppError = $state<string | null>(null)
  let grantAppPending = $state(false)

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
      const { error } = await (api.api.v1.teams as any)[id].patch({
        name: editName,
        description: editDescription || undefined,
      })
      if (error) throw error
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
      const { error } = await (api.api.v1.teams as any)[id].members.post({
        userId: addMemberUserId,
        roleInTeam: addMemberRole,
      })
      if (error) throw error
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
    if (!confirm('Remove this member from the team?')) return
    const { error } = await (api.api.v1.teams as any)[id].members[userId].delete()
    if (error) { alert('Failed to remove member'); return }
    queryClient.invalidateQueries({ queryKey: ['teams', id] })
  }

  async function handleGrantApp(e: SubmitEvent) {
    e.preventDefault()
    grantAppError = null
    grantAppPending = true
    try {
      const { error } = await (api.api.v1.teams as any)[id].apps.post({ appId: grantAppId })
      if (error) throw error
      grantAppId = ''
      queryClient.invalidateQueries({ queryKey: ['teams', id] })
    } catch (e) {
      grantAppError = e instanceof Error ? e.message : 'Failed to grant app'
    } finally {
      grantAppPending = false
    }
  }

  async function handleRevokeApp(appId: string) {
    if (!confirm('Revoke access to this app?')) return
    const { error } = await (api.api.v1.teams as any)[id].apps[appId].delete()
    if (error) { alert('Failed to revoke app'); return }
    queryClient.invalidateQueries({ queryKey: ['teams', id] })
  }

  async function handleDeleteTeam() {
    if (!confirm('Delete this team? This cannot be undone.')) return
    const { error } = await (api.api.v1.teams as any)[id].delete()
    if (error) { alert('Failed to delete team'); return }
    queryClient.invalidateQueries({ queryKey: ['teams'] })
    await goto('/admin/teams')
  }
</script>

<div class="p-8">
  {#if $query.isLoading}
    <div class="animate-pulse space-y-4">
      <div class="h-8 w-48 rounded bg-neutral-800"></div>
      <div class="h-64 rounded-xl bg-neutral-800"></div>
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
                class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <input
                type="text"
                bind:value={editDescription}
                placeholder="Description"
                class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            {#if editError}
              <p class="text-xs text-red-400">{editError}</p>
            {/if}
            <div class="flex gap-2">
              <button type="submit" disabled={editPending} class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50">Save</button>
              <button type="button" onclick={() => editing = false} class="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-800">Cancel</button>
            </div>
          </form>
        {:else}
          <h1 class="text-xl font-semibold">{team.name}</h1>
          {#if team.description}
            <p class="mt-1 text-sm text-neutral-400">{team.description}</p>
          {/if}
        {/if}
      </div>
      <div class="flex gap-2">
        {#if !editing}
          <button onclick={startEdit} class="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-800">Edit</button>
        {/if}
        <button onclick={handleDeleteTeam} class="rounded-lg border border-red-800 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950">Delete</button>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <!-- Members -->
      <div class="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 class="mb-4 text-sm font-semibold">Members</h2>

        {#if team.members && team.members.length > 0}
          <div class="mb-4 space-y-1">
            {#each team.members as member}
              <div class="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-neutral-800">
                <div>
                  <p class="text-sm">{member.name ?? member.userId}</p>
                  <p class="text-xs text-neutral-500">{member.email ?? ''} &middot; {member.roleInTeam}</p>
                </div>
                <button
                  onclick={() => handleRemoveMember(member.userId)}
                  class="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-red-950"
                >
                  Remove
                </button>
              </div>
            {/each}
          </div>
        {:else}
          <p class="mb-4 text-xs text-neutral-500">No members yet.</p>
        {/if}

        <!-- Add member form -->
        <form onsubmit={handleAddMember} class="space-y-2 border-t border-neutral-800 pt-4">
          <p class="text-xs font-medium text-neutral-400">Add Member</p>
          <input
            type="text"
            bind:value={addMemberUserId}
            placeholder="User ID"
            required
            class="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <select
            bind:value={addMemberRole}
            class="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="member">Member</option>
            <option value="lead">Lead</option>
          </select>
          {#if addMemberError}
            <p class="text-xs text-red-400">{addMemberError}</p>
          {/if}
          <button
            type="submit"
            disabled={addMemberPending}
            class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50"
          >
            Add
          </button>
        </form>
      </div>

      <!-- App Access -->
      <div class="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 class="mb-4 text-sm font-semibold">App Access</h2>

        {#if team.apps && team.apps.length > 0}
          <div class="mb-4 space-y-1">
            {#each team.apps as app}
              <div class="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-neutral-800">
                <div>
                  <p class="text-sm">{app.name ?? app.appId}</p>
                  <p class="text-xs text-neutral-500">{app.slug ?? ''}</p>
                </div>
                <button
                  onclick={() => handleRevokeApp(app.appId)}
                  class="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-red-950"
                >
                  Revoke
                </button>
              </div>
            {/each}
          </div>
        {:else}
          <p class="mb-4 text-xs text-neutral-500">No app access granted.</p>
        {/if}

        <!-- Grant app form -->
        <form onsubmit={handleGrantApp} class="space-y-2 border-t border-neutral-800 pt-4">
          <p class="text-xs font-medium text-neutral-400">Grant App Access</p>
          <input
            type="text"
            bind:value={grantAppId}
            placeholder="App ID"
            required
            class="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          {#if grantAppError}
            <p class="text-xs text-red-400">{grantAppError}</p>
          {/if}
          <button
            type="submit"
            disabled={grantAppPending}
            class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50"
          >
            Grant
          </button>
        </form>
      </div>
    </div>
  {:else if $query.error}
    <p class="text-sm text-red-400">Failed to load team.</p>
  {/if}

  <a href="/admin/teams" class="mt-6 inline-block text-xs text-indigo-400 hover:text-indigo-300">&larr; Back to teams</a>
</div>
