<script lang="ts">
  import { page } from '$app/stores'
  import { employeeQuery, updateEmployeeMutation } from '$lib/queries/employees'
  import { teamsQuery } from '$lib/queries/teams'
  import { adminApi } from '$lib/admin-api'
  import { useQueryClient } from '@tanstack/svelte-query'
  import { PORTAL_ROLES, PORTAL_ROLE_LABELS, type PortalRole } from '@coms-portal/shared'

  const ROLES = PORTAL_ROLES

  const id = $derived($page.params.id!)
  const query = $derived(employeeQuery(id))
  const mutation = updateEmployeeMutation()
  const teams = teamsQuery()
  const queryClient = useQueryClient()
  const provisioningFailedFromCreate = $derived($page.url.searchParams.get('provisioning') === 'failed')

  // Role
  let selectedRole = $state<PortalRole | null>(null)
  const dirty = $derived(selectedRole !== null && $query.data && selectedRole !== $query.data.portalRole)

  // Reset / Deactivate / Provisioning state
  let resetMessage = $state<string | null>(null)
  let resetError = $state<string | null>(null)
  let resetPending = $state(false)
  let deleteError = $state<string | null>(null)
  let deletePending = $state(false)
  let confirmingDeactivate = $state(false)
  let provisioningMessage = $state<string | null>(null)
  let provisioningError = $state<string | null>(null)
  let retryProvisioningPending = $state(false)

  // Workspace upgrade
  let editingWorkspace = $state(false)
  let workspaceEmail = $state('')
  let workspaceError = $state<string | null>(null)
  let workspacePending = $state(false)

  // Phone (WA)
  let editingPhone = $state(false)
  let phoneValue = $state('')
  let phonePending = $state(false)
  let phoneError = $state<string | null>(null)

  // Birth Date
  let editingBirthDate = $state(false)
  let birthDateValue = $state('')
  let birthDatePending = $state(false)
  let birthDateError = $state<string | null>(null)

  // Position
  let editingPosition = $state(false)
  let positionValue = $state('')
  let positionPending = $state(false)
  let positionError = $state<string | null>(null)

  // Personal Email
  let editingPersonalEmail = $state(false)
  let personalEmailValue = $state('')
  let personalEmailPending = $state(false)
  let personalEmailError = $state<string | null>(null)

  // Leader
  let editingLeader = $state(false)
  let leaderValue = $state('')
  let leaderPending = $state(false)
  let leaderError = $state<string | null>(null)

  // Team
  let editingTeam = $state(false)
  let teamIdValue = $state('')
  let teamPending = $state(false)
  let teamError = $state<string | null>(null)

  // Branch
  let editingBranch = $state(false)
  let branchValue = $state<'indonesia' | 'thailand' | ''>('')
  let branchPending = $state(false)
  let branchError = $state<string | null>(null)

  // Sync selectedRole when data loads
  $effect(() => {
    if ($query.data && selectedRole === null) {
      selectedRole = $query.data.portalRole
    }
  })

  async function handleSaveRole() {
    if (!dirty || !selectedRole) return
    await $mutation.mutateAsync({ id, data: { portalRole: selectedRole } })
  }

  async function handleDeactivate() {
    deleteError = null
    deletePending = true
    try {
      await adminApi.deleteEmployee(id)
      confirmingDeactivate = false
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['employees', id] }),
        queryClient.invalidateQueries({ queryKey: ['employees'] }),
      ])
    } catch (error) {
      deleteError = error instanceof Error ? error.message : 'Failed to deactivate employee'
    } finally {
      deletePending = false
    }
  }

  async function handleResetPassword() {
    resetMessage = null
    resetError = null
    resetPending = true
    try {
      const result = await adminApi.resetEmployeePassword(id)
      resetMessage = `Password reset email sent to ${result.email}.`
    } catch (error) {
      resetError = error instanceof Error ? error.message : 'Failed to send reset email'
    } finally {
      resetPending = false
    }
  }

  async function handleUpgradeWorkspace() {
    workspaceError = null
    workspacePending = true
    try {
      await $mutation.mutateAsync({ id, data: { email: workspaceEmail, hasGoogleWorkspace: true } })
      editingWorkspace = false
      workspaceEmail = ''
    } catch (error) {
      workspaceError = error instanceof Error ? error.message : 'Failed to update'
    } finally {
      workspacePending = false
    }
  }

  async function handleRetryProvisioning() {
    provisioningMessage = null
    provisioningError = null
    retryProvisioningPending = true
    try {
      const result = await adminApi.retryEmployeeProvisioning(id)
      if (result.status === 'ready') {
        provisioningMessage = 'Employee provisioning completed successfully.'
      } else {
        provisioningError = result.error ?? 'Employee provisioning did not complete successfully.'
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['employees', id] }),
        queryClient.invalidateQueries({ queryKey: ['employees'] }),
      ])
    } catch (error) {
      provisioningError = error instanceof Error ? error.message : 'Failed to retry provisioning'
    } finally {
      retryProvisioningPending = false
    }
  }

  async function handleSavePhone() {
    phoneError = null
    phonePending = true
    try {
      await $mutation.mutateAsync({ id, data: { phone: phoneValue } })
      editingPhone = false
    } catch (error) {
      phoneError = error instanceof Error ? error.message : 'Failed to save'
    } finally {
      phonePending = false
    }
  }

  async function handleSaveBirthDate() {
    birthDateError = null
    birthDatePending = true
    try {
      await $mutation.mutateAsync({ id, data: { birthDate: birthDateValue } })
      editingBirthDate = false
    } catch (error) {
      birthDateError = error instanceof Error ? error.message : 'Failed to save'
    } finally {
      birthDatePending = false
    }
  }

  async function handleSavePosition() {
    positionError = null
    positionPending = true
    try {
      await $mutation.mutateAsync({ id, data: { position: positionValue } })
      editingPosition = false
    } catch (error) {
      positionError = error instanceof Error ? error.message : 'Failed to save'
    } finally {
      positionPending = false
    }
  }

  async function handleSavePersonalEmail() {
    personalEmailError = null
    personalEmailPending = true
    try {
      await $mutation.mutateAsync({ id, data: { personalEmail: personalEmailValue } })
      editingPersonalEmail = false
    } catch (error) {
      personalEmailError = error instanceof Error ? error.message : 'Failed to save'
    } finally {
      personalEmailPending = false
    }
  }

  async function handleSaveLeader() {
    leaderError = null
    leaderPending = true
    try {
      await $mutation.mutateAsync({ id, data: { leaderName: leaderValue } })
      editingLeader = false
    } catch (error) {
      leaderError = error instanceof Error ? error.message : 'Failed to save'
    } finally {
      leaderPending = false
    }
  }

  async function handleSaveTeam() {
    teamError = null
    teamPending = true
    try {
      await $mutation.mutateAsync({ id, data: { teamId: teamIdValue || undefined } })
      editingTeam = false
    } catch (error) {
      teamError = error instanceof Error ? error.message : 'Failed to save'
    } finally {
      teamPending = false
    }
  }

  async function handleSaveBranch() {
    branchError = null
    branchPending = true
    try {
      await $mutation.mutateAsync({ id, data: { branch: branchValue || undefined } })
      editingBranch = false
    } catch (error) {
      branchError = error instanceof Error ? error.message : 'Failed to save'
    } finally {
      branchPending = false
    }
  }
</script>

<div class="p-8">
  {#if $query.isLoading}
    <div class="animate-pulse space-y-4">
      <div class="h-8 w-48 rounded bg-neutral-800"></div>
      <div class="h-64 rounded-xl bg-neutral-800"></div>
    </div>
  {:else if $query.data}
    {@const emp = $query.data}
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold">{emp.name}</h1>
        <p class="text-sm text-neutral-400">{emp.email}</p>
        {#if provisioningFailedFromCreate}
          <p class="mt-2 text-xs text-yellow-400">Employee was created, but provisioning failed. Retry provisioning below.</p>
        {/if}
        {#if resetMessage}
          <p class="mt-2 text-xs text-green-400">{resetMessage}</p>
        {/if}
        {#if resetError}
          <p class="mt-2 text-xs text-red-400">{resetError}</p>
        {/if}
        {#if deleteError}
          <p class="mt-2 text-xs text-red-400">{deleteError}</p>
        {/if}
        {#if provisioningMessage}
          <p class="mt-2 text-xs text-green-400">{provisioningMessage}</p>
        {/if}
        {#if provisioningError}
          <p class="mt-2 text-xs text-red-400">{provisioningError}</p>
        {/if}
      </div>
      <div class="flex gap-2">
        {#if emp.provisioningStatus === 'ready'}
          <button
            onclick={handleResetPassword}
            disabled={resetPending}
            class="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-800 disabled:opacity-50"
          >
            {resetPending ? 'Sending…' : 'Reset Password'}
          </button>
        {/if}
        {#if confirmingDeactivate}
          <div class="flex items-center gap-2">
            <button
              onclick={handleDeactivate}
              disabled={deletePending}
              class="rounded-lg border border-red-800 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950 disabled:opacity-50"
            >
              {deletePending ? 'Deactivating…' : 'Confirm Deactivate'}
            </button>
            <button
              onclick={() => { confirmingDeactivate = false; deleteError = null }}
              class="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-800"
            >
              Cancel
            </button>
          </div>
        {:else}
          <button
            onclick={() => { confirmingDeactivate = true; deleteError = null }}
            class="rounded-lg border border-red-800 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950"
          >
            Deactivate
          </button>
        {/if}
      </div>
    </div>

    <div class="max-w-lg space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
      <!-- Role -->
      <div class="flex items-center justify-between border-b border-neutral-800 pb-2">
        <span class="text-xs text-neutral-400">Role</span>
        <div class="flex items-center gap-2">
          <select
            bind:value={selectedRole}
            class="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
          >
            {#each ROLES as role}
              <option value={role}>{PORTAL_ROLE_LABELS[role]}</option>
            {/each}
          </select>
          {#if dirty}
            <button
              onclick={handleSaveRole}
              disabled={$mutation.isPending}
              class="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50"
            >
              {$mutation.isPending ? 'Saving...' : 'Save'}
            </button>
          {/if}
        </div>
      </div>

      <!-- Department (read-only) -->
      <div class="flex justify-between border-b border-neutral-800 pb-2">
        <span class="text-xs text-neutral-400">Department</span>
        <span class="text-sm">{emp.department ?? '-'}</span>
      </div>

      <!-- Position (editable) -->
      <div class="flex items-start justify-between gap-4 border-b border-neutral-800 pb-2">
        <span class="text-xs text-neutral-400">Position</span>
        <div class="text-right">
          {#if editingPosition}
            <div class="flex flex-col items-end gap-2">
              <input
                type="text"
                bind:value={positionValue}
                class="rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
              />
              {#if positionError}
                <p class="text-xs text-red-400">{positionError}</p>
              {/if}
              <div class="flex gap-2">
                <button
                  onclick={handleSavePosition}
                  disabled={positionPending}
                  class="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50"
                >
                  {positionPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  onclick={() => { editingPosition = false; positionError = null }}
                  class="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          {:else}
            <div class="flex items-center gap-2">
              <span class="text-sm">{emp.position ?? '-'}</span>
              <button
                onclick={() => { editingPosition = true; positionValue = emp.position ?? '' }}
                class="rounded-lg border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
              >
                Edit
              </button>
            </div>
          {/if}
        </div>
      </div>

      <!-- Phone / WA (editable) -->
      <div class="flex items-start justify-between gap-4 border-b border-neutral-800 pb-2">
        <span class="text-xs text-neutral-400">Phone (WA)</span>
        <div class="text-right">
          {#if editingPhone}
            <div class="flex flex-col items-end gap-2">
              <input
                type="text"
                bind:value={phoneValue}
                class="rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
              />
              {#if phoneError}
                <p class="text-xs text-red-400">{phoneError}</p>
              {/if}
              <div class="flex gap-2">
                <button
                  onclick={handleSavePhone}
                  disabled={phonePending}
                  class="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50"
                >
                  {phonePending ? 'Saving…' : 'Save'}
                </button>
                <button
                  onclick={() => { editingPhone = false; phoneError = null }}
                  class="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          {:else}
            <div class="flex items-center gap-2">
              <span class="text-sm">{emp.phone ?? '-'}</span>
              <button
                onclick={() => { editingPhone = true; phoneValue = emp.phone ?? '' }}
                class="rounded-lg border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
              >
                Edit
              </button>
            </div>
          {/if}
        </div>
      </div>

      <!-- Birth Date (editable) -->
      <div class="flex items-start justify-between gap-4 border-b border-neutral-800 pb-2">
        <span class="text-xs text-neutral-400">Birth Date</span>
        <div class="text-right">
          {#if editingBirthDate}
            <div class="flex flex-col items-end gap-2">
              <input
                type="date"
                bind:value={birthDateValue}
                class="rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
              />
              {#if birthDateError}
                <p class="text-xs text-red-400">{birthDateError}</p>
              {/if}
              <div class="flex gap-2">
                <button
                  onclick={handleSaveBirthDate}
                  disabled={birthDatePending}
                  class="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50"
                >
                  {birthDatePending ? 'Saving…' : 'Save'}
                </button>
                <button
                  onclick={() => { editingBirthDate = false; birthDateError = null }}
                  class="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          {:else}
            <div class="flex items-center gap-2">
              <span class="text-sm">{(emp as any).birthDate ?? '-'}</span>
              <button
                onclick={() => { editingBirthDate = true; birthDateValue = (emp as any).birthDate ?? '' }}
                class="rounded-lg border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
              >
                Edit
              </button>
            </div>
          {/if}
        </div>
      </div>

      <!-- Personal Email (editable) -->
      <div class="flex items-start justify-between gap-4 border-b border-neutral-800 pb-2">
        <span class="text-xs text-neutral-400">Personal Email</span>
        <div class="text-right">
          {#if editingPersonalEmail}
            <div class="flex flex-col items-end gap-2">
              <input
                type="email"
                bind:value={personalEmailValue}
                class="rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
              />
              {#if personalEmailError}
                <p class="text-xs text-red-400">{personalEmailError}</p>
              {/if}
              <div class="flex gap-2">
                <button
                  onclick={handleSavePersonalEmail}
                  disabled={personalEmailPending}
                  class="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50"
                >
                  {personalEmailPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  onclick={() => { editingPersonalEmail = false; personalEmailError = null }}
                  class="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          {:else}
            <div class="flex items-center gap-2">
              <span class="text-sm">{(emp as any).personalEmail ?? '-'}</span>
              <button
                onclick={() => { editingPersonalEmail = true; personalEmailValue = (emp as any).personalEmail ?? '' }}
                class="rounded-lg border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
              >
                Edit
              </button>
            </div>
          {/if}
        </div>
      </div>

      <!-- Leader (editable) -->
      <div class="flex items-start justify-between gap-4 border-b border-neutral-800 pb-2">
        <span class="text-xs text-neutral-400">Leader</span>
        <div class="text-right">
          {#if editingLeader}
            <div class="flex flex-col items-end gap-2">
              <input
                type="text"
                bind:value={leaderValue}
                class="rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
              />
              {#if leaderError}
                <p class="text-xs text-red-400">{leaderError}</p>
              {/if}
              <div class="flex gap-2">
                <button
                  onclick={handleSaveLeader}
                  disabled={leaderPending}
                  class="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50"
                >
                  {leaderPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  onclick={() => { editingLeader = false; leaderError = null }}
                  class="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          {:else}
            <div class="flex items-center gap-2">
              <span class="text-sm">{(emp as any).leaderName ?? '-'}</span>
              <button
                onclick={() => { editingLeader = true; leaderValue = (emp as any).leaderName ?? '' }}
                class="rounded-lg border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
              >
                Edit
              </button>
            </div>
          {/if}
        </div>
      </div>

      <!-- Team (editable) -->
      <div class="flex items-start justify-between gap-4 border-b border-neutral-800 pb-2">
        <span class="text-xs text-neutral-400">Team</span>
        <div class="text-right">
          {#if editingTeam}
            <div class="flex flex-col items-end gap-2">
              <select
                bind:value={teamIdValue}
                class="rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="">No team</option>
                {#if $teams.data}
                  {#each $teams.data as team}
                    <option value={team.id}>{team.name}</option>
                  {/each}
                {/if}
              </select>
              {#if teamError}
                <p class="text-xs text-red-400">{teamError}</p>
              {/if}
              <div class="flex gap-2">
                <button
                  onclick={handleSaveTeam}
                  disabled={teamPending}
                  class="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50"
                >
                  {teamPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  onclick={() => { editingTeam = false; teamError = null }}
                  class="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          {:else}
            <div class="flex items-center gap-2">
              <span class="text-sm">
                {#if (emp as any).teamId && $teams.data}
                  {$teams.data.find((t) => t.id === (emp as any).teamId)?.name ?? 'Unknown team'}
                {:else}
                  No team
                {/if}
              </span>
              <button
                onclick={() => { editingTeam = true; teamIdValue = (emp as any).teamId ?? '' }}
                class="rounded-lg border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
              >
                Edit
              </button>
            </div>
          {/if}
        </div>
      </div>

      <!-- Branch (editable) -->
      <div class="flex items-start justify-between gap-4 border-b border-neutral-800 pb-2">
        <span class="text-xs text-neutral-400">Branch</span>
        <div class="text-right">
          {#if editingBranch}
            <div class="flex flex-col items-end gap-2">
              <select
                bind:value={branchValue}
                class="rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Not set</option>
                <option value="indonesia">Indonesia</option>
                <option value="thailand">Thailand</option>
              </select>
              {#if branchError}
                <p class="text-xs text-red-400">{branchError}</p>
              {/if}
              <div class="flex gap-2">
                <button
                  onclick={handleSaveBranch}
                  disabled={branchPending}
                  class="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50"
                >
                  {branchPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  onclick={() => { editingBranch = false; branchError = null }}
                  class="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          {:else}
            <div class="flex items-center gap-2">
              <span class="text-sm capitalize">{emp.branch ?? '-'}</span>
              <button
                onclick={() => { editingBranch = true; branchValue = (emp.branch as 'indonesia' | 'thailand' | '') ?? '' }}
                class="rounded-lg border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
              >
                Edit
              </button>
            </div>
          {/if}
        </div>
      </div>

      <!-- Status (read-only) -->
      <div class="flex justify-between border-b border-neutral-800 pb-2">
        <span class="text-xs text-neutral-400">Status</span>
        <span class="text-sm" class:text-green-400={emp.status === 'active'} class:text-red-400={emp.status !== 'active'}>{emp.status}</span>
      </div>

      <!-- Workspace upgrade -->
      {#if !emp.hasGoogleWorkspace}
        <div class="flex items-start justify-between gap-4 border-b border-neutral-800 pb-2">
          <span class="text-xs text-neutral-400">Workspace</span>
          <div class="text-right">
            {#if editingWorkspace}
              <div class="flex flex-col items-end gap-2">
                <input
                  type="email"
                  bind:value={workspaceEmail}
                  placeholder="workspace@ahacommerce.net"
                  class="rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
                />
                {#if workspaceError}
                  <p class="text-xs text-red-400">{workspaceError}</p>
                {/if}
                <div class="flex gap-2">
                  <button
                    onclick={handleUpgradeWorkspace}
                    disabled={!workspaceEmail || workspacePending}
                    class="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {workspacePending ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onclick={() => { editingWorkspace = false; workspaceEmail = ''; workspaceError = null }}
                    class="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            {:else}
              <div class="flex items-center gap-2">
                <span class="text-sm text-neutral-500">No workspace account</span>
                <button
                  onclick={() => { editingWorkspace = true; workspaceEmail = '' }}
                  class="rounded-lg border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                >
                  Upgrade
                </button>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Provisioning -->
      <div class="flex items-start justify-between gap-4 border-b border-neutral-800 pb-2">
        <span class="text-xs text-neutral-400">Provisioning</span>
        <div class="text-right">
          <p
            class="text-sm"
            class:text-green-400={emp.provisioningStatus === 'ready'}
            class:text-yellow-400={emp.provisioningStatus === 'pending' || emp.provisioningStatus === 'processing'}
            class:text-red-400={emp.provisioningStatus === 'failed'}
          >
            {emp.provisioningStatus}
          </p>
          {#if emp.provisioningError}
            <p class="mt-1 text-xs text-red-400">{emp.provisioningError}</p>
          {/if}
          {#if emp.provisioningStatus === 'failed' && emp.status === 'active'}
            <button
              onclick={handleRetryProvisioning}
              disabled={retryProvisioningPending}
              class="mt-2 rounded-lg border border-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50"
            >
              {retryProvisioningPending ? 'Retrying…' : 'Retry Provisioning'}
            </button>
          {/if}
        </div>
      </div>
    </div>
  {:else}
    <p class="text-sm text-neutral-500">Employee not found.</p>
  {/if}

  <a href="/admin/employees" class="mt-6 inline-block text-xs text-indigo-400 hover:text-indigo-300">&larr; Back to employees</a>
</div>
