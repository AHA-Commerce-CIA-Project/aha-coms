<script lang="ts">
  import { page } from '$app/stores'
  import { employeeQuery, updateEmployeeMutation } from '$lib/queries/employees'
  import { adminApi } from '$lib/admin-api'
  import { useQueryClient } from '@tanstack/svelte-query'

  const ROLES = ['employee', 'admin'] as const

  const id = $derived($page.params.id!)
  const query = $derived(employeeQuery(id))
  const mutation = updateEmployeeMutation()
  const queryClient = useQueryClient()
  const provisioningFailedFromCreate = $derived($page.url.searchParams.get('provisioning') === 'failed')

  let selectedRole = $state<string | null>(null)
  const dirty = $derived(selectedRole !== null && $query.data && selectedRole !== $query.data.portalRole)
  let resetMessage = $state<string | null>(null)
  let resetError = $state<string | null>(null)
  let resetPending = $state(false)
  let deleteError = $state<string | null>(null)
  let deletePending = $state(false)
  let confirmingDeactivate = $state(false)
  let provisioningMessage = $state<string | null>(null)
  let provisioningError = $state<string | null>(null)
  let retryProvisioningPending = $state(false)

  // Sync selectedRole when data loads or changes
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
              onclick={() => {
                confirmingDeactivate = false
                deleteError = null
              }}
              class="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-800"
            >
              Cancel
            </button>
          </div>
        {:else}
          <button
            onclick={() => {
              confirmingDeactivate = true
              deleteError = null
            }}
            class="rounded-lg border border-red-800 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950"
          >
            Deactivate
          </button>
        {/if}
      </div>
    </div>

    <div class="max-w-lg space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
      <div class="flex items-center justify-between border-b border-neutral-800 pb-2">
        <span class="text-xs text-neutral-400">Role</span>
        <div class="flex items-center gap-2">
          <select
            bind:value={selectedRole}
            class="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
          >
            {#each ROLES as role}
              <option value={role}>{role.replace('_', ' ')}</option>
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
      <div class="flex justify-between border-b border-neutral-800 pb-2">
        <span class="text-xs text-neutral-400">Department</span>
        <span class="text-sm">{emp.department ?? '-'}</span>
      </div>
      <div class="flex justify-between border-b border-neutral-800 pb-2">
        <span class="text-xs text-neutral-400">Position</span>
        <span class="text-sm">{emp.position ?? '-'}</span>
      </div>
      <div class="flex justify-between border-b border-neutral-800 pb-2">
        <span class="text-xs text-neutral-400">Phone</span>
        <span class="text-sm">{emp.phone ?? '-'}</span>
      </div>
      <div class="flex justify-between border-b border-neutral-800 pb-2">
        <span class="text-xs text-neutral-400">Status</span>
        <span class="text-sm" class:text-green-400={emp.status === 'active'} class:text-red-400={emp.status !== 'active'}>{emp.status}</span>
      </div>
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
