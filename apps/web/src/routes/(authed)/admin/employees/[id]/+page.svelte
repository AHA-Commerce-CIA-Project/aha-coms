<script lang="ts">
  import { page } from '$app/stores'
  import { employeeQuery, updateEmployeeMutation } from '$lib/queries/employees'
  import { api } from '$lib/api'
  import { useQueryClient } from '@tanstack/svelte-query'

  const ROLES = ['employee', 'admin', 'super_admin'] as const

  const id = $derived($page.params.id!)
  const query = $derived(employeeQuery(id))
  const mutation = updateEmployeeMutation()
  const queryClient = useQueryClient()

  let selectedRole = $state<string | null>(null)
  const dirty = $derived(selectedRole !== null && $query.data && selectedRole !== $query.data.portalRole)

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
    if (!confirm('Deactivate this employee?')) return
    await (api.api.v1.employees as any)[id].delete()
    queryClient.invalidateQueries({ queryKey: ['employees', id] })
  }

  async function handleResetPassword() {
    const { error } = await (api.api.v1.employees as any)[id]['reset-password'].post({})
    if (error) alert('Failed to send reset email')
    else alert('Password reset email sent')
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
      </div>
      <div class="flex gap-2">
        <button onclick={handleResetPassword} class="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-800">Reset Password</button>
        <button onclick={handleDeactivate} class="rounded-lg border border-red-800 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950">Deactivate</button>
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
      <div class="flex justify-between">
        <span class="text-xs text-neutral-400">Workspace</span>
        <span class="text-sm">{emp.hasGoogleWorkspace ? 'Yes' : 'No'}</span>
      </div>
    </div>
  {:else}
    <p class="text-sm text-neutral-500">Employee not found.</p>
  {/if}

  <a href="/admin/employees" class="mt-6 inline-block text-xs text-indigo-400 hover:text-indigo-300">&larr; Back to employees</a>
</div>
