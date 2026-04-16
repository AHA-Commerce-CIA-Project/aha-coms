<script lang="ts">
  import { goto } from '$app/navigation'
  import { createEmployeeMutation } from '$lib/queries/employees'

  const mutation = createEmployeeMutation()

  let form = $state({
    email: '',
    name: '',
    phone: '',
    department: '',
    position: '',
    portalRole: 'employee' as 'employee' | 'admin' | 'super_admin',
    hasGoogleWorkspace: false,
  })

  let error = $state<string | null>(null)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    error = null
    try {
      await $mutation.mutateAsync({
        email: form.email,
        name: form.name,
        phone: form.phone || undefined,
        department: form.department || undefined,
        position: form.position || undefined,
        portalRole: form.portalRole,
        hasGoogleWorkspace: form.hasGoogleWorkspace,
      })
      await goto('/admin/employees')
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create employee'
    }
  }
</script>

<div class="p-8">
  <h1 class="mb-6 text-xl font-semibold">New Employee</h1>

  <form onsubmit={handleSubmit} class="max-w-lg space-y-4">
    <div>
      <label for="employee-email" class="mb-1 block text-xs text-neutral-400">Email</label>
      <input id="employee-email" type="email" bind:value={form.email} required class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
    </div>
    <div>
      <label for="employee-name" class="mb-1 block text-xs text-neutral-400">Name</label>
      <input id="employee-name" type="text" bind:value={form.name} required class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="employee-phone" class="mb-1 block text-xs text-neutral-400">Phone</label>
        <input id="employee-phone" type="text" bind:value={form.phone} class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
      </div>
      <div>
        <label for="employee-department" class="mb-1 block text-xs text-neutral-400">Department</label>
        <input id="employee-department" type="text" bind:value={form.department} class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
      </div>
    </div>
    <div>
      <label for="employee-position" class="mb-1 block text-xs text-neutral-400">Position</label>
      <input id="employee-position" type="text" bind:value={form.position} class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
    </div>
    <div>
      <label for="employee-portal-role" class="mb-1 block text-xs text-neutral-400">Portal Role</label>
      <select id="employee-portal-role" bind:value={form.portalRole} class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none">
        <option value="employee">Employee</option>
        <option value="admin">Admin</option>
        <option value="super_admin">Super Admin</option>
      </select>
    </div>
    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" bind:checked={form.hasGoogleWorkspace} class="rounded border-neutral-700" />
      Has Google Workspace
    </label>

    {#if error}
      <p class="text-xs text-red-400">{error}</p>
    {/if}

    <div class="flex gap-3">
      <button type="submit" disabled={$mutation.isPending} class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50">Create</button>
      <a href="/admin/employees" class="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800">Cancel</a>
    </div>
  </form>
</div>
