<script lang="ts">
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { base } from '$app/paths'
  import { teamQuery } from '$lib/queries/teams'
  import { appsQuery } from '$lib/queries/apps'
  import { adminApi } from '$lib/admin-api'
  import { useQueryClient } from '@tanstack/svelte-query'
  import {
    Button,
    Input,
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
  } from '@coms-portal/ui-svelte/primitives'

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

  // Staged members state
  let stagedMembers = $state<Array<{ id: string; name: string; email: string; roleInTeam: string }>>([])
  let batchPending = $state(false)
  let batchError = $state<string | null>(null)

  // User search autocomplete state
  let searchInput = $state('')
  let searchResults = $state<Array<{ id: string; name: string; email: string }>>([])
  let showDropdown = $state(false)
  let searchLoading = $state(false)
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  function handleSearchInput(value: string) {
    searchInput = value
    clearTimeout(debounceTimer)
    if (value.trim().length < 2) {
      searchResults = []
      showDropdown = false
      return
    }
    searchLoading = true
    debounceTimer = setTimeout(async () => {
      try {
        const results = await adminApi.searchUsers(value.trim())
        const memberIds = new Set($query.data?.members?.map((m) => m.userId) ?? [])
        const stagedIds = new Set(stagedMembers.map(m => m.id))
        searchResults = results.filter((u) => !memberIds.has(u.id) && !stagedIds.has(u.id))
        showDropdown = searchResults.length > 0
      } catch {
        searchResults = []
        showDropdown = false
      } finally {
        searchLoading = false
      }
    }, 300)
  }

  function stageUser(user: { id: string; name: string; email: string }) {
    stagedMembers = [...stagedMembers, { ...user, roleInTeam: 'member' }]
    searchInput = ''
    searchResults = []
    showDropdown = false
  }

  function unstageMember(userId: string) {
    stagedMembers = stagedMembers.filter(m => m.id !== userId)
  }

  function updateStagedRole(userId: string, role: string) {
    stagedMembers = stagedMembers.map(m => m.id === userId ? { ...m, roleInTeam: role } : m)
  }

  async function handleBatchAdd(e: SubmitEvent) {
    e.preventDefault()
    if (stagedMembers.length === 0) return
    batchError = null
    batchPending = true
    try {
      await adminApi.addTeamMembersBatch(id, {
        members: stagedMembers.map(m => ({ userId: m.id, roleInTeam: m.roleInTeam }))
      })
      stagedMembers = []
      queryClient.invalidateQueries({ queryKey: ['teams', id] })
    } catch (e) {
      batchError = e instanceof Error ? e.message : 'Failed to add members'
    } finally {
      batchPending = false
    }
  }

  // Grant app state
  let grantAppId = $state('')
  let grantAppError = $state<string | null>(null)
  let grantAppPending = $state(false)

  // Per-member role update state
  let memberRolePending = $state<string | null>(null)
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
      await adminApi.grantTeamApp(id, { appId: grantAppId })
      grantAppId = ''
      queryClient.invalidateQueries({ queryKey: ['teams', id] })
    } catch (e) {
      grantAppError = e instanceof Error ? e.message : 'Failed to grant app'
    } finally {
      grantAppPending = false
    }
  }

  async function handleMemberRoleChange(userId: string, appId: string, role: string) {
    const key = `${userId}-${appId}`
    memberRolePending = key
    try {
      if (role) {
        await adminApi.setMemberAppRole(userId, appId, role)
      } else {
        await adminApi.removeMemberAppRole(userId, appId)
      }
      queryClient.invalidateQueries({ queryKey: ['teams', id] })
    } catch (e) {
      actionError = e instanceof Error ? e.message : 'Failed to update member role'
    } finally {
      memberRolePending = null
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
      await goto(`${base}/admin/teams`)
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
              <Input
                type="text"
                bind:value={editName}
                required
                class="rounded-lg"
              />
            </div>
            <div>
              <Input
                type="text"
                bind:value={editDescription}
                placeholder="Description"
              />
            </div>
            {#if editError}
              <p class="text-xs text-destructive">{editError}</p>
            {/if}
            <div class="flex gap-2">
              <Button type="submit" size="sm" disabled={editPending}>{editPending ? 'Saving…' : 'Save'}</Button>
              <Button type="button" size="sm" variant="outline" onclick={() => editing = false}>Cancel</Button>
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
          <Button size="sm" variant="outline" onclick={startEdit}>Edit</Button>
        {/if}
        {#if confirmingDelete}
          <Button
            size="sm"
            variant="destructive"
            onclick={handleDeleteTeam}
            disabled={deletePending}
          >
            {deletePending ? 'Deleting…' : 'Confirm Delete'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onclick={() => {
              confirmingDelete = false
              actionError = null
            }}
          >
            Cancel
          </Button>
        {:else}
          <Button
            size="sm"
            variant="destructive"
            onclick={() => {
              confirmingDelete = true
              actionError = null
            }}
          >
            Delete
          </Button>
        {/if}
      </div>
    </div>

    {#if actionError}
      <p class="mb-4 text-sm text-destructive">{actionError}</p>
    {/if}

    <div class="grid gap-6 lg:grid-cols-2">
      <!-- Members -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm font-semibold">Members</CardTitle>
        </CardHeader>
        <CardContent>
          {#if team.members && team.members.length > 0}
            <div class="mb-4 space-y-1">
              {#each team.members as member}
                <div class="rounded-lg px-2 py-1.5 hover:bg-accent">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-sm">{member.name ?? member.userId}</p>
                      <p class="text-xs text-muted-foreground">{member.email ?? ''} &middot; {member.roleInTeam}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onclick={() => {
                        if (confirmingMemberRemovalId === member.userId) {
                          handleRemoveMember(member.userId)
                        } else {
                          confirmingMemberRemovalId = member.userId
                          actionError = null
                        }
                      }}
                      disabled={pendingMemberRemovalId === member.userId}
                    >
                      {#if pendingMemberRemovalId === member.userId}
                        Removing…
                      {:else if confirmingMemberRemovalId === member.userId}
                        Confirm Remove
                      {:else}
                        Remove
                      {/if}
                    </Button>
                  </div>
                  {#if team.apps && team.apps.length > 0}
                    <div class="mt-1 flex flex-wrap gap-1.5">
                      {#each team.apps as app}
                        {@const appDetail = $allAppsQuery.data?.find((a) => a.id === app.appId)}
                        {@const declaredRoles = appDetail?.appRoles ?? []}
                        {@const currentRole = member.appRoles?.find((r) => r.appId === app.appId)?.appRole ?? ''}
                        {#if declaredRoles.length > 0}
                          <div class="flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5">
                            <span class="text-[10px] text-muted-foreground">{app.slug ?? app.name}:</span>
                            <select
                              value={currentRole}
                              onchange={(e) => handleMemberRoleChange(member.userId, app.appId, e.currentTarget.value)}
                              disabled={memberRolePending === `${member.userId}-${app.appId}`}
                              class="rounded border-none bg-transparent px-0.5 py-0 text-[10px] focus:outline-none disabled:opacity-50"
                            >
                              <option value="">Default</option>
                              {#each declaredRoles as role}
                                <option value={role.key}>{role.label}</option>
                              {/each}
                            </select>
                          </div>
                        {/if}
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <p class="mb-4 text-xs text-muted-foreground">No members yet.</p>
          {/if}

          <!-- Add member form -->
          <form onsubmit={handleBatchAdd} class="space-y-2 border-t border-border pt-4">
            <p class="text-xs font-medium text-muted-foreground">Add Member</p>
            <div class="relative">
              <Input
                type="text"
                value={searchInput}
                oninput={(e) => handleSearchInput(e.currentTarget.value)}
                onfocus={() => { if (searchResults.length > 0) showDropdown = true }}
                onblur={() => setTimeout(() => { showDropdown = false }, 200)}
                placeholder="Search by name or email..."
                class="w-full"
              />
              {#if searchLoading}
                <div class="absolute right-3 top-2.5 text-xs text-muted-foreground">...</div>
              {/if}
              {#if showDropdown}
                <div class="absolute z-10 mt-1 w-full rounded-lg border border-border bg-card shadow-lg">
                  {#each searchResults as user}
                    <button
                      type="button"
                      onmousedown={() => stageUser(user)}
                      class="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent first:rounded-t-lg last:rounded-b-lg"
                    >
                      <span class="font-medium">{user.name}</span>
                      <span class="text-xs text-muted-foreground">{user.email}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
            {#if stagedMembers.length > 0}
              <div class="space-y-1">
                {#each stagedMembers as staged}
                  <div class="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5 text-sm">
                    <div class="min-w-0 flex-1">
                      <span class="font-medium">{staged.name}</span>
                      <span class="ml-1 text-xs text-muted-foreground">{staged.email}</span>
                    </div>
                    <Select
                      type="single"
                      value={staged.roleInTeam}
                      onValueChange={(v) => { if (v) updateStagedRole(staged.id, v) }}
                    >
                      <SelectTrigger size="sm" class="w-24">
                        <span>{staged.roleInTeam}</span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member" label="Member" />
                        <SelectItem value="lead" label="Lead" />
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onclick={() => unstageMember(staged.id)}
                    >&times;</Button>
                  </div>
                {/each}
              </div>
            {/if}
            {#if batchError}
              <p class="text-xs text-destructive">{batchError}</p>
            {/if}
            <Button
              type="submit"
              size="sm"
              disabled={batchPending || stagedMembers.length === 0}
            >
              {batchPending ? 'Adding…' : stagedMembers.length > 0 ? `Add ${stagedMembers.length} Member${stagedMembers.length === 1 ? '' : 's'}` : 'Add Members'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <!-- App Access -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm font-semibold">App Access</CardTitle>
        </CardHeader>
        <CardContent>
          {#if team.apps && team.apps.length > 0}
            <div class="mb-4 space-y-1">
              {#each team.apps as app}
                <div class="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-accent">
                  <div>
                    <p class="text-sm">{app.name ?? app.appId}</p>
                    <p class="text-xs text-muted-foreground">{app.slug ?? ''}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    onclick={() => {
                      if (confirmingRevokeAppId === app.appId) {
                        handleRevokeApp(app.appId)
                      } else {
                        confirmingRevokeAppId = app.appId
                        actionError = null
                      }
                    }}
                    disabled={pendingRevokeAppId === app.appId}
                  >
                    {#if pendingRevokeAppId === app.appId}
                      Revoking…
                    {:else if confirmingRevokeAppId === app.appId}
                      Confirm Revoke
                    {:else}
                      Revoke
                    {/if}
                  </Button>
                </div>
              {/each}
            </div>
          {:else}
            <p class="mb-4 text-xs text-muted-foreground">No app access granted.</p>
          {/if}

          <!-- Grant app form -->
          <form onsubmit={handleGrantApp} class="space-y-2 border-t border-border pt-4">
            <p class="text-xs font-medium text-muted-foreground">Grant App Access</p>
            <Select
              type="single"
              value={grantAppId || undefined}
              onValueChange={(v) => { grantAppId = v ?? '' }}
            >
              <SelectTrigger class="w-full">
                <span>
                  {#if grantAppId && $allAppsQuery.data}
                    {$allAppsQuery.data.find((a) => a.id === grantAppId)?.name ?? 'Select an app'}
                  {:else}
                    Select an app
                  {/if}
                </span>
              </SelectTrigger>
              <SelectContent>
                {#if $allAppsQuery.data}
                  {#each $allAppsQuery.data.filter((a) => a.status !== 'deprecated') as app}
                    <SelectItem value={app.id} label="{app.name} ({app.slug})" />
                  {/each}
                {/if}
              </SelectContent>
            </Select>
            {#if grantAppError}
              <p class="text-xs text-destructive">{grantAppError}</p>
            {/if}
            <Button type="submit" size="sm" disabled={grantAppPending || !grantAppId}>
              {grantAppPending ? 'Granting…' : 'Grant'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  {:else if $query.error}
    <p class="text-sm text-destructive">Failed to load team.</p>
  {/if}

  <a href="{base}/admin/teams" class="mt-6 inline-block text-xs text-primary hover:text-primary/80">&larr; Back to teams</a>
</div>
