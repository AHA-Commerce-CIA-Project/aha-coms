<script lang="ts">
  import { goto } from '$app/navigation'
  import { createEmployeeMutation } from '$lib/queries/employees'
  import { teamsQuery } from '$lib/queries/teams'

  const mutation = createEmployeeMutation()
  const teams = teamsQuery()

  let form = $state({
    email: '',
    personalEmail: '',
    name: '',
    phone: '',
    position: '',
    branch: '' as '' | 'indonesia' | 'thailand',
    portalRole: 'employee' as 'employee' | 'admin',
    teamId: '',
  })

  let error = $state<string | null>(null)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    error = null
    try {
      const result = await $mutation.mutateAsync({
        email: form.email,
        personalEmail: form.personalEmail || undefined,
        name: form.name,
        phone: form.phone || undefined,
        position: form.position || undefined,
        branch: form.branch || undefined,
        portalRole: form.portalRole,
        teamId: form.teamId || undefined,
      })
      if (result.provisioningStatus === 'failed') {
        await goto(`/admin/employees/${result.id}?provisioning=failed`)
        return
      }

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
    <div>
      <label for="employee-personal-email" class="mb-1 block text-xs text-neutral-400">Personal Email</label>
      <input id="employee-personal-email" type="email" bind:value={form.personalEmail} class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="employee-phone" class="mb-1 block text-xs text-neutral-400">Phone</label>
        <input id="employee-phone" type="text" bind:value={form.phone} class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
      </div>
      <div>
        <label for="employee-position" class="mb-1 block text-xs text-neutral-400">Position</label>
        <input id="employee-position" type="text" bind:value={form.position} class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
      </div>
    </div>
    <div>
      <label for="employee-branch" class="mb-1 block text-xs text-neutral-400">Branch</label>
      <select id="employee-branch" bind:value={form.branch} required class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none">
        <option value="" disabled>Select branch</option>
        <option value="indonesia">Indonesia</option>
        <option value="thailand">Thailand</option>
      </select>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="employee-portal-role" class="mb-1 block text-xs text-neutral-400">Portal Role</label>
        <select id="employee-portal-role" bind:value={form.portalRole} class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none">
          <option value="employee">Employee</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div>
        <label for="employee-team" class="mb-1 block text-xs text-neutral-400">Team</label>
        <select id="employee-team" bind:value={form.teamId} class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none">
          <option value="">No team</option>
          {#if $teams.data}
            {#each $teams.data as team}
              <option value={team.id}>{team.name}</option>
            {/each}
          {/if}
        </select>
      </div>
    </div>
    {#if error}
      <p class="text-xs text-red-400">{error}</p>
    {/if}

    <div class="flex gap-3">
      <button type="submit" disabled={$mutation.isPending} class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50">Create</button>
      <a href="/admin/employees" class="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800">Cancel</a>
    </div>
  </form>
</div>
