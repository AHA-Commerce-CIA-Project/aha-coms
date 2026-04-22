  <script lang="ts">
  import { employeesQuery, batchUpdateEmployeesMutation, importEmployeesCsvMutation } from '$lib/queries/employees'
  import BatchToolbar from '$lib/components/batch-toolbar.svelte'
  import { PORTAL_ROLE_LABELS, PORTAL_ROLES } from '@coms-portal/shared'
  import { adminApi } from '$lib/admin-api'

  const MAX_EMPLOYEE_IMPORT_CSV_BYTES = 2 * 1024 * 1024

  let page = $state(1)
  let search = $state('')
  let selected = $state<Set<string>>(new Set())

  const query = $derived(employeesQuery(page, 20, search))
  const mutation = batchUpdateEmployeesMutation()
  const importMutation = importEmployeesCsvMutation()

  const BATCH_ACTIONS = [
    {
      key: 'portalRole',
      label: 'Change Role',
      options: PORTAL_ROLES.map((role) => ({ value: role, label: PORTAL_ROLE_LABELS[role] })),
    },
  ]

  const allIds = $derived(($query.data?.data ?? []).map((employee) => employee.id))
  const allSelected = $derived(allIds.length > 0 && allIds.every((employeeId) => selected.has(employeeId)))

  let syncPending = $state(false)
  let syncResult = $state<{
    updated: number
    created: Array<{ sheetName: string; personalEmail: string; userId: string }>
    matched: Array<{ sheetName: string; dbName: string; email: string }>
    unmatched: Array<{ sheetName: string; reason: string }>
    errors: string[]
  } | null>(null)
  let syncError = $state<string | null>(null)

  async function handleSyncEmployeeInfo() {
    syncPending = true
    syncResult = null
    syncError = null
    try {
      syncResult = await adminApi.triggerEmployeeInfoSync()
    } catch (err) {
      syncError = err instanceof Error ? err.message : 'Sync failed'
    } finally {
      syncPending = false
    }
  }

  let csvFile = $state<File | null>(null)
  let importError = $state<string | null>(null)
  let importSuccess = $state<string | null>(null)
  let previewReady = $state(false)
  let importResult = $state<{
    mode: 'preview' | 'commit'
    parsedCount: number
    previewCount: number
    createdCount: number
    skippedCount: number
    errorCount: number
    flaggedCount: number
    flagged: Array<{ rowNumber: number; csvEmail: string; csvName: string; existingName: string; existingEmail: string }>
    preview: Array<{ rowNumber: number; email: string; name: string }>
    created: Array<{ rowNumber: number; id: string; email: string; name: string }>
    skipped: Array<{ rowNumber: number; email?: string; reason: string }>
    errors: Array<{ rowNumber: number; email?: string; message: string }>
  } | null>(null)

  function toggleAll() {
    if (allSelected) {
      selected = new Set()
    } else {
      selected = new Set(allIds)
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selected = next
  }

  async function handleBatchApply(action: string, value: string) {
    await $mutation.mutateAsync({ ids: [...selected], field: action, value })
    selected = new Set()
  }

  function handleCsvFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    csvFile = input.files?.[0] ?? null
    importError = null
    importSuccess = null
    importResult = null
    previewReady = false

    if (csvFile && csvFile.size > MAX_EMPLOYEE_IMPORT_CSV_BYTES) {
      importError = `CSV file is too large. Maximum size is ${Math.floor(MAX_EMPLOYEE_IMPORT_CSV_BYTES / (1024 * 1024))}MB.`
      csvFile = null
      input.value = ''
    }
  }

  async function handlePreviewCsv() {
    if (!csvFile) {
      importError = 'Select a CSV file first.'
      return
    }

    importError = null
    importSuccess = null
    importResult = null

    try {
      const csv = await csvFile.text()
      importResult = await $importMutation.mutateAsync({ csv, preview: true })
      previewReady = true
    } catch (error) {
      importError = error instanceof Error ? error.message : 'Failed to import CSV'
    }
  }

  async function handleImportCsv() {
    if (!csvFile) {
      importError = 'Select a CSV file first.'
      return
    }

    importError = null
    importSuccess = null

    try {
      const csv = await csvFile.text()
      importResult = await $importMutation.mutateAsync({ csv, preview: false })
      importSuccess = `Import complete. Created ${importResult.createdCount} employee(s)${importResult.flaggedCount > 0 ? `, ${importResult.flaggedCount} flagged for review` : ''}.`
      csvFile = null
      previewReady = false
    } catch (error) {
      importError = error instanceof Error ? error.message : 'Failed to import CSV'
    }
  }
</script>

<div class="p-8">
  <div class="mb-6 flex items-center justify-between">
    <h1 class="text-xl font-semibold">Employees</h1>
    <a href="/admin/employees/new" class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500">Add Employee</a>
  </div>

  <div class="mb-6 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div class="max-w-2xl space-y-2">
        <h2 class="text-sm font-semibold">Sync employee info from sheet</h2>
        <p class="text-sm text-neutral-400">Sinkronisasi data karyawan (HP, tanggal lahir, jabatan, tim, penilai) dari Google Sheet. Karyawan yang belum terdaftar tapi punya email pribadi akan otomatis dibuat. Data yang kosong di sheet tidak akan menimpa data yang sudah ada.</p>
      </div>
      <div class="flex flex-col gap-3 lg:min-w-64">
        <button
          type="button"
          onclick={handleSyncEmployeeInfo}
          disabled={syncPending}
          class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          {syncPending ? 'Syncing…' : 'Sync Employee Info'}
        </button>
        {#if syncError}
          <p class="text-sm text-red-400">{syncError}</p>
        {/if}
        {#if syncResult}
          <div class="space-y-1 text-sm">
            <p class="text-green-400">Updated: {syncResult.updated}</p>
            {#if syncResult.created.length > 0}
              <p class="text-blue-400">Created: {syncResult.created.length}</p>
              <ul class="ml-2 space-y-0.5 text-xs text-neutral-400">
                {#each syncResult.created.slice(0, 5) as c}
                  <li>{c.sheetName} — {c.personalEmail}</li>
                {/each}
              </ul>
            {/if}
            {#if syncResult.unmatched.length > 0}
              <p class="text-yellow-400">Unmatched: {syncResult.unmatched.length}</p>
              <ul class="ml-2 space-y-0.5 text-xs text-neutral-400">
                {#each syncResult.unmatched.slice(0, 5) as u}
                  <li>{u.sheetName} — {u.reason}</li>
                {/each}
              </ul>
            {/if}
            {#if syncResult.errors.length > 0}
              <p class="text-red-400">Errors: {syncResult.errors.length}</p>
              <ul class="ml-2 space-y-0.5 text-xs text-red-300">
                {#each syncResult.errors.slice(0, 5) as e}
                  <li>{e}</li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>

  <div class="mb-6 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div class="max-w-2xl space-y-2">
        <h2 class="text-sm font-semibold">Import employees from Google Admin CSV</h2>
        <p class="text-sm text-neutral-400">
          Upload file export seperti <code>User_Download_15042026_093211.csv</code>. Sistem hanya membuat
          employee baru dengan status <strong>Active</strong>; employee yang sudah ada akan dilewati.
        </p>
      </div>

      <div class="flex flex-col gap-3 lg:min-w-96">
        <input
          type="file"
          accept=".csv,text/csv"
          onchange={handleCsvFileChange}
          class="block w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-sm file:text-neutral-200"
        />
        <div class="flex gap-3">
          <button
            type="button"
            onclick={handlePreviewCsv}
            disabled={!csvFile || $importMutation.isPending}
            class="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium hover:bg-neutral-800 disabled:opacity-50"
          >
            {$importMutation.isPending && !previewReady ? 'Previewing…' : 'Preview CSV'}
          </button>
          <button
            type="button"
            onclick={handleImportCsv}
            disabled={!csvFile || !previewReady || $importMutation.isPending}
            class="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-white disabled:opacity-50"
          >
            {$importMutation.isPending && previewReady ? 'Importing…' : 'Import CSV'}
          </button>
        </div>
      </div>
    </div>

    {#if csvFile}
      <p class="mt-3 text-xs text-neutral-500">
        Selected file: {csvFile.name} ({(csvFile.size / 1024).toFixed(1)} KB)
      </p>
    {/if}

    {#if importError}
      <p class="mt-3 text-sm text-red-400">{importError}</p>
    {/if}
    {#if importSuccess}
      <p class="mt-3 text-sm text-green-400">{importSuccess}</p>
    {/if}

    {#if importResult}
      <div class="mt-4 space-y-3 border-t border-neutral-800 pt-4">
        <div class="grid gap-3 sm:grid-cols-5">
          <div class="rounded-lg bg-neutral-950 p-3">
            <p class="text-xs text-neutral-500">Parsed</p>
            <p class="mt-1 text-lg font-semibold">{importResult.parsedCount}</p>
          </div>
          <div class="rounded-lg bg-neutral-950 p-3">
            <p class="text-xs text-neutral-500">{importResult.mode === 'preview' ? 'Ready to create' : 'Created'}</p>
            <p class="mt-1 text-lg font-semibold text-green-400">
              {importResult.mode === 'preview' ? importResult.previewCount : importResult.createdCount}
            </p>
          </div>
          <div class="rounded-lg bg-neutral-950 p-3">
            <p class="text-xs text-neutral-500">Skipped</p>
            <p class="mt-1 text-lg font-semibold text-yellow-400">{importResult.skippedCount}</p>
          </div>
          <div class="rounded-lg bg-neutral-950 p-3">
            <p class="text-xs text-neutral-500">Flagged</p>
            <p class="mt-1 text-lg font-semibold text-orange-400">{importResult.flaggedCount}</p>
          </div>
          <div class="rounded-lg bg-neutral-950 p-3">
            <p class="text-xs text-neutral-500">Errors</p>
            <p class="mt-1 text-lg font-semibold text-red-400">{importResult.errorCount}</p>
          </div>
        </div>

        {#if importResult.mode === 'preview' && importResult.preview.length > 0}
          <div>
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Preview</h3>
            <div class="space-y-1 text-sm">
              {#each importResult.preview.slice(0, 10) as row}
                <p>{row.email} <span class="text-neutral-500">({row.name})</span></p>
              {/each}
            </div>
          </div>
        {/if}

        {#if importResult.mode === 'commit' && importResult.created.length > 0}
          <div>
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Created</h3>
            <div class="space-y-1 text-sm">
              {#each importResult.created.slice(0, 10) as row}
                <p>{row.email} <span class="text-neutral-500">({row.name})</span></p>
              {/each}
            </div>
          </div>
        {/if}

        {#if importResult.skipped.length > 0}
          <div>
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Skipped</h3>
            <div class="space-y-1 text-sm text-neutral-400">
              {#each importResult.skipped.slice(0, 10) as row}
                <p>Row {row.rowNumber}{row.email ? ` — ${row.email}` : ''}: {row.reason}</p>
              {/each}
            </div>
          </div>
        {/if}

        {#if importResult.flagged.length > 0}
          <div>
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-orange-400">Needs Review</h3>
            <p class="mb-2 text-xs text-neutral-500">These CSV rows match a non-workspace user by name. Update the existing employee record with their workspace email instead of creating a new one.</p>
            <div class="space-y-1 text-sm text-neutral-400">
              {#each importResult.flagged.slice(0, 10) as row}
                <p>Row {row.rowNumber} — <span class="text-white">{row.csvName}</span> ({row.csvEmail}) matches existing: <a href="/admin/employees" class="text-indigo-400 hover:text-indigo-300">{row.existingName}</a> ({row.existingEmail})</p>
              {/each}
            </div>
          </div>
        {/if}

        {#if importResult.errors.length > 0}
          <div>
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-red-400">Errors</h3>
            <div class="space-y-1 text-sm text-red-300">
              {#each importResult.errors.slice(0, 10) as row}
                <p>Row {row.rowNumber}{row.email ? ` — ${row.email}` : ''}: {row.message}</p>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <input type="text" placeholder="Search by email..." bind:value={search} class="mb-4 w-full max-w-sm rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />

  <div class="mb-3">
    <BatchToolbar
      selectedCount={selected.size}
      actions={BATCH_ACTIONS}
      onApply={handleBatchApply}
      isPending={$mutation.isPending}
      entityLabel="employee"
    />
  </div>

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
          <th class="pb-2 w-8">
            <input type="checkbox" checked={allSelected} onchange={toggleAll} class="rounded border-neutral-700" />
          </th>
          <th class="pb-2 font-medium">Name</th>
          <th class="pb-2 font-medium">Email</th>
          <th class="pb-2 font-medium">Personal Email</th>
          <th class="pb-2 font-medium">Role</th>
          <th class="pb-2 font-medium">Status</th>
          <th class="pb-2 font-medium">Provisioning</th>
        </tr>
      </thead>
      <tbody>
        {#each $query.data.data as employee}
          <tr class="border-b border-neutral-800/50 hover:bg-neutral-900">
            <td class="py-2">
              <input type="checkbox" checked={selected.has(employee.id)} onchange={() => toggleOne(employee.id)} class="rounded border-neutral-700" />
            </td>
            <td class="py-2"><a href="/admin/employees/{employee.id}" class="text-indigo-400 hover:text-indigo-300">{employee.name}</a></td>
            <td class="py-2 text-neutral-400">{employee.email}</td>
            <td class="py-2 text-neutral-400">{employee.personalEmail ?? '—'}</td>
            <td class="py-2"><span class="rounded-full bg-neutral-800 px-2 py-0.5 text-xs">{employee.portalRole}</span></td>
            <td class="py-2"><span class="text-xs" class:text-green-400={employee.status === 'active'} class:text-red-400={employee.status !== 'active'}>{employee.status}</span></td>
            <td class="py-2">
              <span
                class="text-xs"
                class:text-green-400={employee.provisioningStatus === 'ready'}
                class:text-yellow-400={employee.provisioningStatus === 'pending' || employee.provisioningStatus === 'processing'}
                class:text-red-400={employee.provisioningStatus === 'failed'}
              >
                {employee.provisioningStatus}
              </span>
            </td>
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
