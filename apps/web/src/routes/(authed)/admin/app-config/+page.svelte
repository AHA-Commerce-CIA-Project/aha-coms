<script lang="ts">
  import { createManifestsQuery, createAppConfigQuery, createSingleAppConfigMutation, createBulkPreviewMutation, createBulkCommitMutation } from '$lib/queries/app-config'
  import ManifestEditor from '$lib/components/manifest-editor.svelte'
  import BatchToolbar from '$lib/components/batch-toolbar.svelte'
  import { adminApi } from '$lib/admin-api'
  import type { AppConfigManifest, AppConfigRow, BulkPreviewChange } from '$lib/admin-api'
  import {
    Button,
    Input,
    Badge,
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from '@coms-portal/ui/primitives'

  // ---------------------------------------------------------------------------
  // App selection
  // ---------------------------------------------------------------------------
  const manifestsQuery = createManifestsQuery()
  let selectedAppId = $state<string>('')
  let filter = $state('')
  let debouncedFilter = $state('')
  let filterDebounce: ReturnType<typeof setTimeout> | null = null

  function onFilterInput() {
    if (filterDebounce) clearTimeout(filterDebounce)
    filterDebounce = setTimeout(() => { debouncedFilter = filter }, 300)
  }

  const configQuery = $derived(createAppConfigQuery(selectedAppId, debouncedFilter))

  const selectedManifest = $derived(
    ($manifestsQuery.data?.manifests ?? []).find((m) => m.appId === selectedAppId) ?? null
  )

  // ---------------------------------------------------------------------------
  // Multi-select state
  // ---------------------------------------------------------------------------
  let selected = $state<Set<string>>(new Set())

  const allIds = $derived(($configQuery.data?.rows ?? []).map((r) => r.portalSub))
  const allSelected = $derived(allIds.length > 0 && allIds.every((id) => selected.has(id)))

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

  // ---------------------------------------------------------------------------
  // Single-edit modal
  // ---------------------------------------------------------------------------
  const singleMutation = createSingleAppConfigMutation()
  let editRow = $state<AppConfigRow | null>(null)
  let editOpen = $state(false)
  let editConfig = $state<Record<string, unknown>>({})
  let singleError = $state<string | null>(null)
  let singleSuccess = $state<string | null>(null)

  function openSingleEdit(row: AppConfigRow) {
    editRow = row
    editConfig = { ...row.config }
    singleError = null
    singleSuccess = null
    editOpen = true
  }

  function closeSingleEdit() {
    editOpen = false
    editRow = null
    editConfig = {}
    singleError = null
    singleSuccess = null
  }

  async function submitSingleEdit() {
    if (!editRow || !selectedAppId) return
    singleError = null
    singleSuccess = null
    try {
      await $singleMutation.mutateAsync({ appId: selectedAppId, portalSub: editRow.portalSub, config: editConfig })
      singleSuccess = 'Config updated.'
      setTimeout(closeSingleEdit, 1000)
    } catch (err) {
      singleError = err instanceof Error ? err.message : 'Update failed'
    }
  }

  // ---------------------------------------------------------------------------
  // Selection-bulk apply (BatchToolbar rhythm)
  // ---------------------------------------------------------------------------
  const bulkPreview = createBulkPreviewMutation()
  const bulkCommit = createBulkCommitMutation()

  let bulkField = $state<string>('')
  let bulkValue = $state<string>('')
  let bulkError = $state<string | null>(null)
  let bulkSuccess = $state<string | null>(null)

  const BULK_ACTIONS = $derived(
    selectedManifest
      ? Object.entries(selectedManifest.configSchema)
          .filter(([, f]) => f.type === 'enum')
          .map(([key, f]) => ({
            key,
            label: key,
            options: (f.values ?? []).map((v: string) => ({ value: v, label: v })),
          }))
      : []
  )

  async function handleBulkApply(actionKey: string, value: string) {
    if (!selectedAppId || selected.size === 0) return
    bulkError = null
    bulkSuccess = null

    const selectedRows = ($configQuery.data?.rows ?? []).filter((r) => selected.has(r.portalSub))
    const rows = selectedRows.map((r) => ({
      portalSub: r.portalSub,
      config: { ...r.config, [actionKey]: value },
    }))

    try {
      const preview = await $bulkPreview.mutateAsync({ appId: selectedAppId, rows })
      if (preview.changes.length === 0) {
        bulkSuccess = 'No changes to apply.'
        return
      }
      await $bulkCommit.mutateAsync({ appId: selectedAppId, rows })
      selected = new Set()
      bulkSuccess = `Applied ${preview.changes.length} update${preview.changes.length !== 1 ? 's' : ''}.`
    } catch (err) {
      bulkError = err instanceof Error ? err.message : 'Bulk apply failed'
    }
  }

  // ---------------------------------------------------------------------------
  // CSV bulk flow
  // ---------------------------------------------------------------------------
  let csvFile = $state<File | null>(null)
  let csvError = $state<string | null>(null)
  let csvSuccess = $state<string | null>(null)
  let csvPreview = $state<{ changes: BulkPreviewChange[]; totalRows: number } | null>(null)
  let csvCommitting = $state(false)

  async function downloadCsv() {
    if (!selectedAppId) return
    try {
      const res = await adminApi.downloadAppConfigCsv(selectedAppId)
      if (!res.ok) throw new Error(`Download failed: ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `app-config-${selectedAppId}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      csvError = err instanceof Error ? err.message : 'Download failed'
    }
  }

  async function handleCsvPreview() {
    if (!csvFile || !selectedAppId || !selectedManifest) return
    csvError = null
    csvSuccess = null
    csvPreview = null

    try {
      const text = await csvFile.text()
      const parsed = parseCsv(text, selectedManifest)
      if (parsed.error) { csvError = parsed.error; return }
      const result = await $bulkPreview.mutateAsync({ appId: selectedAppId, rows: parsed.data! })
      csvPreview = result
    } catch (err) {
      csvError = err instanceof Error ? err.message : 'Preview failed'
    }
  }

  async function handleCsvCommit() {
    if (!csvFile || !selectedAppId || !selectedManifest || !csvPreview) return
    csvCommitting = true
    csvError = null
    csvSuccess = null
    try {
      const text = await csvFile.text()
      const parsed = parseCsv(text, selectedManifest)
      if (parsed.error) { csvError = parsed.error; return }
      const result = await $bulkCommit.mutateAsync({ appId: selectedAppId, rows: parsed.data! })
      csvSuccess = `Committed ${result.updatedCount} rows (batch ${result.batchId.slice(0, 8)}…).`
      csvPreview = null
      csvFile = null
    } catch (err) {
      csvError = err instanceof Error ? err.message : 'Commit failed'
    } finally {
      csvCommitting = false
    }
  }

  function parseCsv(
    text: string,
    manifest: AppConfigManifest,
  ): { data: Array<{ portalSub: string; config: Record<string, unknown> }>; error?: undefined } | { error: string; data?: undefined } {
    const lines = text.trim().split('\n')
    if (lines.length < 2) return { error: 'CSV must have a header row and at least one data row' }

    const headers = lines[0]!.split(',').map((h) => h.trim())
    const keys = Object.keys(manifest.configSchema)

    if (!headers.includes('portalSub')) return { error: 'CSV missing portalSub column' }
    for (const key of keys) {
      if (!headers.includes(key)) return { error: `CSV missing column: ${key}` }
    }

    const data: Array<{ portalSub: string; config: Record<string, unknown> }> = []
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i]!.split(',')
      const portalSub = cells[headers.indexOf('portalSub')]?.trim() ?? ''
      if (!portalSub) continue

      const config: Record<string, unknown> = {}
      for (const key of keys) {
        const raw = cells[headers.indexOf(key)]?.trim() ?? ''
        const field = manifest.configSchema[key]
        if (field?.type === 'boolean') config[key] = raw.toLowerCase() === 'true'
        else if (field?.type === 'integer') config[key] = parseInt(raw, 10)
        else config[key] = raw
      }
      data.push({ portalSub, config })
    }

    return { data }
  }

  function diffSummary(changes: BulkPreviewChange[], manifest: AppConfigManifest): string[] {
    const keys = Object.keys(manifest.configSchema)
    const summaries: string[] = []
    for (const key of keys) {
      const byValue = new Map<string, number>()
      for (const ch of changes) {
        const prev = String(ch.previousConfig[key] ?? '')
        const next = String(ch.newConfig[key] ?? '')
        if (prev !== next) {
          const label = `${prev} → ${next}`
          byValue.set(label, (byValue.get(label) ?? 0) + 1)
        }
      }
      for (const [label, count] of byValue.entries()) {
        summaries.push(`${count} user${count !== 1 ? 's' : ''} will change ${key}: ${label}`)
      }
    }
    return summaries
  }
</script>

<div class="p-8">
  <div class="mb-6">
    <h1 class="text-xl font-semibold">App Config</h1>
    <p class="mt-1 text-sm text-muted-foreground">Manage per-user per-app configuration.</p>
  </div>

  <!-- App picker -->
  {#if $manifestsQuery.isLoading}
    <div class="h-10 w-64 animate-pulse rounded-lg bg-muted"></div>
  {:else if $manifestsQuery.data}
    <div class="mb-6 flex items-center gap-4">
      <Select
        type="single"
        value={selectedAppId || undefined}
        onValueChange={(v) => { selectedAppId = v ?? ''; selected = new Set(); csvPreview = null; csvFile = null }}
      >
        <SelectTrigger class="w-56">
          <span>
            {#if selectedAppId && $manifestsQuery.data}
              {$manifestsQuery.data.manifests.find((m) => m.appId === selectedAppId)?.displayName ?? '— select an app —'}
            {:else}
              — select an app —
            {/if}
          </span>
        </SelectTrigger>
        <SelectContent>
          {#each $manifestsQuery.data.manifests as manifest}
            <SelectItem value={manifest.appId} label={manifest.displayName} />
          {/each}
        </SelectContent>
      </Select>

      {#if selectedAppId}
        <Input
          type="text"
          placeholder="Search users…"
          bind:value={filter}
          oninput={onFilterInput}
          class="w-56"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onclick={downloadCsv}
        >
          Download CSV
        </Button>
      {/if}
    </div>
  {/if}

  {#if selectedAppId && selectedManifest}
    <!-- Selection-bulk toolbar -->
    {#if selected.size > 0 && BULK_ACTIONS.length > 0}
      <div class="mb-3">
        <BatchToolbar
          selectedCount={selected.size}
          actions={BULK_ACTIONS}
          onApply={handleBulkApply}
          isPending={$bulkCommit.isPending || $bulkPreview.isPending}
          entityLabel="user"
        />
      </div>
    {/if}
    {#if bulkError}
      <p class="mb-2 text-sm text-destructive">{bulkError}</p>
    {/if}
    {#if bulkSuccess}
      <p class="mb-2 text-sm text-status-active">{bulkSuccess}</p>
    {/if}

    <!-- User config table -->
    {#if $configQuery.isLoading}
      <div class="animate-pulse space-y-2">
        {#each Array(5) as _}
          <div class="h-12 rounded-lg bg-muted"></div>
        {/each}
      </div>
    {:else if $configQuery.data}
      {#if $configQuery.data.rows.length === 0}
        <p class="text-sm text-muted-foreground">No users found.</p>
      {:else}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-8">
                <input type="checkbox" checked={allSelected} onchange={toggleAll} class="rounded border-border" />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              {#each Object.keys(selectedManifest.configSchema) as key}
                <TableHead>{key}</TableHead>
              {/each}
              <TableHead>Updated</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each $configQuery.data.rows as row}
              <TableRow>
                <TableCell>
                  <input type="checkbox" checked={selected.has(row.portalSub)} onchange={() => toggleOne(row.portalSub)} class="rounded border-border" />
                </TableCell>
                <TableCell class="font-medium">{row.name}</TableCell>
                <TableCell class="text-muted-foreground">{row.email}</TableCell>
                {#each Object.keys(selectedManifest.configSchema) as key}
                  <TableCell>
                    <Badge variant="secondary">{String(row.config[key] ?? '—')}</Badge>
                  </TableCell>
                {/each}
                <TableCell class="text-xs text-muted-foreground">{new Date(row.updatedAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onclick={() => openSingleEdit(row)}
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            {/each}
          </TableBody>
        </Table>
      {/if}
    {:else if $configQuery.error}
      <p class="text-sm text-destructive">Failed to load: {$configQuery.error instanceof Error ? $configQuery.error.message : 'Unknown error'}</p>
    {/if}

    <!-- CSV bulk section -->
    <Card class="mt-8">
      <CardHeader>
        <CardTitle class="text-sm font-semibold">CSV Bulk Edit</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <p class="text-xs text-muted-foreground">
          Download the current config CSV, edit it, then upload for preview before committing.
          Unknown portalSubs are rejected. Partial application is not allowed — any error rejects the whole batch.
        </p>

        <div class="flex items-center gap-3">
          <input
            type="file"
            accept=".csv"
            onchange={(e) => { csvFile = (e.target as HTMLInputElement).files?.[0] ?? null; csvPreview = null; csvError = null; csvSuccess = null }}
            class="text-sm text-muted-foreground file:mr-2 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1 file:text-xs file:font-medium"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onclick={handleCsvPreview}
            disabled={!csvFile || $bulkPreview.isPending}
          >
            {$bulkPreview.isPending ? 'Previewing…' : 'Preview'}
          </Button>
        </div>

        {#if csvError}
          <p class="text-sm text-destructive">{csvError}</p>
        {/if}
        {#if csvSuccess}
          <p class="text-sm text-status-active">{csvSuccess}</p>
        {/if}

        {#if csvPreview}
          <div class="space-y-2 rounded-lg border border-border bg-muted p-3">
            <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Diff Preview — {csvPreview.changes.length} of {csvPreview.totalRows} rows will change</p>
            {#each diffSummary(csvPreview.changes, selectedManifest) as line}
              <p class="text-sm">{line}</p>
            {/each}
            {#if csvPreview.changes.length === 0}
              <p class="text-sm text-muted-foreground">No changes detected.</p>
            {:else}
              <div class="mt-3 flex gap-2">
                <Button
                  type="button"
                  onclick={handleCsvCommit}
                  disabled={csvCommitting}
                >
                  {csvCommitting ? 'Committing…' : `Commit ${csvPreview.changes.length} changes`}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onclick={() => { csvPreview = null; csvFile = null }}
                >
                  Cancel
                </Button>
              </div>
            {/if}
          </div>
        {/if}
      </CardContent>
    </Card>
  {/if}
</div>

<!-- Single-edit modal -->
<Dialog bind:open={editOpen}>
  <DialogContent class="max-w-lg">
    <DialogHeader>
      <DialogTitle>Edit config — {editRow?.name}</DialogTitle>
      <DialogDescription>{editRow?.email}</DialogDescription>
    </DialogHeader>

    {#if editRow && selectedManifest}
      <!-- configSchema from admin-api uses a loose string type; cast is safe since
           the backend always produces a valid discriminated union at runtime -->
      <ManifestEditor
        configSchema={selectedManifest.configSchema as never}
        value={editConfig}
        onchange={(v) => editConfig = v}
      />
    {/if}

    {#if singleError}
      <p class="text-sm text-destructive">{singleError}</p>
    {/if}
    {#if singleSuccess}
      <p class="text-sm text-status-active">{singleSuccess}</p>
    {/if}

    <DialogFooter>
      <Button type="button" variant="outline" onclick={closeSingleEdit}>Cancel</Button>
      <Button
        type="button"
        onclick={submitSingleEdit}
        disabled={$singleMutation.isPending}
      >
        {$singleMutation.isPending ? 'Saving…' : 'Save'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
