<script lang="ts">
  import { employeesQuery } from '$lib/queries/employees'

  let page = $state(1)
  let search = $state('')

  const query = $derived(employeesQuery(page, 20, search))
</script>

<div class="p-8">
  <div class="mb-6 flex items-center justify-between">
    <h1 class="text-xl font-semibold">Employees</h1>
    <a href="/admin/employees/new" class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500">Add Employee</a>
  </div>

  <input type="text" placeholder="Search by email..." bind:value={search} class="mb-4 w-full max-w-sm rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />

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
          <th class="pb-2 font-medium">Email</th>
          <th class="pb-2 font-medium">Role</th>
          <th class="pb-2 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {#each $query.data.data as employee}
          <tr class="border-b border-neutral-800/50 hover:bg-neutral-900">
            <td class="py-2"><a href="/admin/employees/{employee.id}" class="text-indigo-400 hover:text-indigo-300">{employee.name}</a></td>
            <td class="py-2 text-neutral-400">{employee.email}</td>
            <td class="py-2"><span class="rounded-full bg-neutral-800 px-2 py-0.5 text-xs">{employee.portalRole}</span></td>
            <td class="py-2"><span class="text-xs" class:text-green-400={employee.status === 'active'} class:text-red-400={employee.status !== 'active'}>{employee.status}</span></td>
          </tr>
        {/each}
      </tbody>
    </table>

    <div class="mt-4 flex items-center justify-between text-xs text-neutral-500">
      <span>{$query.data.total} total</span>
      <div class="flex gap-2">
        <button onclick={() => page = Math.max(1, page - 1)} disabled={page === 1} class="rounded px-2 py-1 hover:bg-neutral-800 disabled:opacity-30">Prev</button>
        <span>Page {page}</span>
        <button onclick={() => page++} disabled={$query.data.data.length < 20} class="rounded px-2 py-1 hover:bg-neutral-800 disabled:opacity-30">Next</button>
      </div>
    </div>
  {/if}
</div>
