<script lang="ts">
  import { adminApi } from '$lib/admin-api'
  import type { TaxonomyEntry, TaxonomyListItem } from '$lib/admin-api'
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
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from '@coms-portal/ui/primitives'
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query'

  const queryClient = useQueryClient()

  // ---------------------------------------------------------------------------
  // Sidebar: all taxonomy IDs
  // ---------------------------------------------------------------------------
  const taxonomiesQuery = createQuery({
    queryKey: ['admin', 'taxonomies'],
    queryFn: () => adminApi.listTaxonomies(),
  })

  let selectedTaxonomyId = $state<string>('')

  // Select first taxonomy on load
  $effect(() => {
    const list = $taxonomiesQuery.data?.taxonomies ?? []
    if (!selectedTaxonomyId && list.length > 0) {
      selectedTaxonomyId = list[0].taxonomyId
    }
  })

  // ---------------------------------------------------------------------------
  // Right panel: entries for selected taxonomy
  // ---------------------------------------------------------------------------
  const entriesQuery = $derived(
    createQuery({
      queryKey: ['admin', 'taxonomies', selectedTaxonomyId, 'entries'],
      queryFn: () => adminApi.listTaxonomyEntries(selectedTaxonomyId),
      enabled: !!selectedTaxonomyId,
    })
  )

  // ---------------------------------------------------------------------------
  // Add / edit entry modal
  // ---------------------------------------------------------------------------
  let editOpen = $state(false)
  let editEntry = $state<TaxonomyEntry | null>(null)
  let editKey = $state('')
  let editValue = $state('')
  let editMetaRaw = $state('') // JSON string for metadata
  let editError = $state<string | null>(null)
  let editSuccess = $state<string | null>(null)

  const upsertMutation = createMutation({
    mutationFn: ({ taxonomyId, key, value, metadata }: { taxonomyId: string; key: string; value: string; metadata: Record<string, unknown> | null }) =>
      adminApi.upsertTaxonomyEntry(taxonomyId, { key, value, metadata }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'taxonomies'] })
    },
  })

  function openAddEntry() {
    editEntry = null
    editKey = ''
    editValue = ''
    editMetaRaw = ''
    editError = null
    editSuccess = null
    editOpen = true
  }

  function openEditEntry(entry: TaxonomyEntry) {
    editEntry = entry
    editKey = entry.key
    editValue = entry.value
    editMetaRaw = entry.metadata ? JSON.stringify(entry.metadata, null, 2) : ''
    editError = null
    editSuccess = null
    editOpen = true
  }

  function closeEdit() {
    editOpen = false
    editEntry = null
  }

  async function submitEdit() {
    if (!selectedTaxonomyId || !editKey.trim() || !editValue.trim()) {
      editError = 'Key and value are required.'
      return
    }
    editError = null

    let metadata: Record<string, unknown> | null = null
    if (editMetaRaw.trim()) {
      try {
        metadata = JSON.parse(editMetaRaw) as Record<string, unknown>
      } catch {
        editError = 'Metadata must be valid JSON.'
        return
      }
    }

    try {
      await $upsertMutation.mutateAsync({ taxonomyId: selectedTaxonomyId, key: editKey.trim(), value: editValue.trim(), metadata })
      editSuccess = 'Saved.'
      setTimeout(closeEdit, 800)
    } catch (err) {
      editError = err instanceof Error ? err.message : 'Save failed.'
    }
  }

  // ---------------------------------------------------------------------------
  // Delete entry
  // ---------------------------------------------------------------------------
  let deleteTarget = $state<TaxonomyEntry | null>(null)
  let deleteOpen = $state(false)
  let deleteError = $state<string | null>(null)

  const deleteMutation = createMutation({
    mutationFn: ({ taxonomyId, key }: { taxonomyId: string; key: string }) =>
      adminApi.deleteTaxonomyEntry(taxonomyId, key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'taxonomies'] })
    },
  })

  function openDelete(entry: TaxonomyEntry) {
    deleteTarget = entry
    deleteError = null
    deleteOpen = true
  }

  async function confirmDelete() {
    if (!deleteTarget || !selectedTaxonomyId) return
    deleteError = null
    try {
      await $deleteMutation.mutateAsync({ taxonomyId: selectedTaxonomyId, key: deleteTarget.key })
      deleteOpen = false
      deleteTarget = null
    } catch (err) {
      deleteError = err instanceof Error ? err.message : 'Delete failed.'
    }
  }

  // ---------------------------------------------------------------------------
  // Bulk CSV upload
  // ---------------------------------------------------------------------------
  let csvFile = $state<File | null>(null)
  let csvError = $state<string | null>(null)
  let csvSuccess = $state<string | null>(null)
  let csvPreview = $state<Array<{ key: string; value: string }> | null>(null)
  let csvCommitting = $state(false)

  const bulkMutation = createMutation({
    mutationFn: ({ taxonomyId, entries }: { taxonomyId: string; entries: Array<{ key: string; value: string }> }) =>
      adminApi.bulkUpsertTaxonomyEntries(taxonomyId, entries),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'taxonomies'] })
    },
  })

  function parseCsvEntries(text: string): { data?: Array<{ key: string; value: string }>; error?: string } {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length < 2) return { error: 'CSV must have a header row (key,value) and at least one data row.' }
    const header = lines[0].toLowerCase().split(',')
    const keyIdx = header.indexOf('key')
    const valueIdx = header.indexOf('value')
    if (keyIdx === -1 || valueIdx === -1) return { error: 'CSV header must contain "key" and "value" columns.' }
    const data: Array<{ key: string; value: string }> = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',')
      const key = (cols[keyIdx] ?? '').trim().replace(/^"|"$/g, '')
      const value = (cols[valueIdx] ?? '').trim().replace(/^"|"$/g, '')
      if (!key) continue
      data.push({ key, value })
    }
    return { data }
  }

  async function handleCsvPreview() {
    if (!csvFile) return
    csvError = null
    csvSuccess = null
    csvPreview = null
    const text = await csvFile.text()
    const parsed = parseCsvEntries(text)
    if (parsed.error) { csvError = parsed.error; return }
    csvPreview = parsed.data ?? []
  }

  async function commitCsv() {
    if (!csvPreview || !selectedTaxonomyId) return
    csvCommitting = true
    csvError = null
    try {
      const result = await $bulkMutation.mutateAsync({ taxonomyId: selectedTaxonomyId, entries: csvPreview })
      csvSuccess = `Bulk upsert complete — ${result.upserted} row${result.upserted !== 1 ? 's' : ''} written. Batch: ${result.batchId}`
      csvPreview = null
      csvFile = null
    } catch (err) {
      csvError = err instanceof Error ? err.message : 'Bulk commit failed.'
    } finally {
      csvCommitting = false
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function metaPreview(entry: TaxonomyEntry): string {
    if (!entry.metadata) return '—'
    return JSON.stringify(entry.metadata)
  }
</script>

<div class="p-8">
  <div class="mb-6">
    <h1 class="text-xl font-semibold">Taxonomies</h1>
    <p class="mt-1 text-sm text-muted-foreground">Manage shared lookup tables used across apps</p>
  </div>

  <div class="flex gap-6 min-h-[600px]">
  <!-- Sidebar: taxonomy IDs -->
  <aside class="w-56 shrink-0">
    <Card>
      <CardHeader>
        <CardTitle class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Taxonomies</CardTitle>
      </CardHeader>
      <CardContent class="p-0">
        {#if $taxonomiesQuery.isPending}
          <p class="px-4 py-3 text-sm text-muted-foreground">Loading…</p>
        {:else if $taxonomiesQuery.isError}
          <p class="px-4 py-3 text-sm text-destructive">Failed to load</p>
        {:else}
          <ul class="divide-y">
            {#each ($taxonomiesQuery.data?.taxonomies ?? []) as tax (tax.taxonomyId)}
              <li>
                <button
                  class="w-full text-left px-4 py-3 text-sm hover:bg-accent transition-colors flex items-center justify-between gap-2
                    {selectedTaxonomyId === tax.taxonomyId ? 'bg-accent font-medium' : ''}"
                  onclick={() => { selectedTaxonomyId = tax.taxonomyId }}
                >
                  <span class="truncate">{tax.taxonomyId}</span>
                  <Badge variant="secondary" class="shrink-0 text-xs">{tax.entryCount}</Badge>
                </button>
              </li>
            {/each}
            {#if ($taxonomiesQuery.data?.taxonomies ?? []).length === 0}
              <li class="px-4 py-3 text-sm text-muted-foreground">No taxonomies registered</li>
            {/if}
          </ul>
        {/if}
      </CardContent>
    </Card>
  </aside>

  <!-- Right panel: entries -->
  <div class="flex-1 min-w-0 flex flex-col gap-4">
    {#if !selectedTaxonomyId}
      <p class="text-muted-foreground text-sm mt-8">Select a taxonomy from the sidebar.</p>
    {:else}
      <div class="flex items-center justify-between gap-4">
        <h2 class="text-lg font-semibold">{selectedTaxonomyId}</h2>
        <Button size="sm" onclick={openAddEntry}>Add entry</Button>
      </div>

      <!-- Entries table -->
      {#if $entriesQuery?.isPending}
        <p class="text-muted-foreground text-sm">Loading entries…</p>
      {:else if $entriesQuery?.isError}
        <p class="text-destructive text-sm">Failed to load entries.</p>
      {:else}
        {@const entries = $entriesQuery?.data?.entries ?? []}
        {#if entries.length === 0}
          <p class="text-muted-foreground text-sm">No entries yet. Add one above or upload a CSV below.</p>
        {:else}
          <div class="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Metadata</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead class="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {#each entries as entry (entry.id)}
                  <TableRow>
                    <TableCell class="font-mono text-xs">{entry.key}</TableCell>
                    <TableCell>{entry.value}</TableCell>
                    <TableCell class="font-mono text-xs text-muted-foreground max-w-[200px] truncate">{metaPreview(entry)}</TableCell>
                    <TableCell class="text-xs text-muted-foreground">{new Date(entry.updatedAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div class="flex gap-1">
                        <Button size="sm" variant="ghost" onclick={() => openEditEntry(entry)}>Edit</Button>
                        <Button size="sm" variant="ghost" class="text-destructive hover:text-destructive" onclick={() => openDelete(entry)}>Delete</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                {/each}
              </TableBody>
            </Table>
          </div>
        {/if}
      {/if}

      <!-- CSV bulk section -->
      <Card class="mt-2">
        <CardHeader>
          <CardTitle class="text-sm font-semibold">Bulk CSV Upload</CardTitle>
        </CardHeader>
        <CardContent class="flex flex-col gap-3">
          <p class="text-xs text-muted-foreground">CSV must have header row: <code>key,value</code>. Metadata not supported in CSV bulk. Upserts existing keys.</p>
          <input
            type="file"
            accept=".csv,text/csv"
            class="text-sm"
            onchange={(e) => {
              const files = (e.currentTarget as HTMLInputElement).files
              csvFile = files?.[0] ?? null
              csvPreview = null
              csvError = null
              csvSuccess = null
            }}
          />
          {#if csvFile && !csvPreview}
            <Button size="sm" variant="outline" onclick={handleCsvPreview}>Preview CSV ({csvFile.name})</Button>
          {/if}
          {#if csvError}
            <p class="text-destructive text-sm">{csvError}</p>
          {/if}
          {#if csvSuccess}
            <p class="text-green-600 dark:text-green-400 text-sm">{csvSuccess}</p>
          {/if}
          {#if csvPreview}
            <div class="rounded border p-3 bg-muted/40 text-xs space-y-1">
              <p class="font-medium">{csvPreview.length} row{csvPreview.length !== 1 ? 's' : ''} to upsert:</p>
              {#each csvPreview.slice(0, 5) as row}
                <div class="font-mono">{row.key} → {row.value}</div>
              {/each}
              {#if csvPreview.length > 5}
                <div class="text-muted-foreground">…and {csvPreview.length - 5} more</div>
              {/if}
            </div>
            <div class="flex gap-2">
              <Button size="sm" onclick={commitCsv} disabled={csvCommitting}>
                {csvCommitting ? 'Committing…' : `Commit ${csvPreview.length} rows`}
              </Button>
              <Button size="sm" variant="outline" onclick={() => { csvPreview = null; csvFile = null }}>Cancel</Button>
            </div>
          {/if}
        </CardContent>
      </Card>
    {/if}
  </div>
  </div>
</div>

<!-- Add/Edit entry dialog -->
<Dialog bind:open={editOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{editEntry ? 'Edit entry' : 'Add entry'} — {selectedTaxonomyId}</DialogTitle>
      <DialogDescription>
        {editEntry ? 'Update key, value, or metadata.' : 'Add a new taxonomy entry. Key must be unique within this taxonomy.'}
      </DialogDescription>
    </DialogHeader>
    <div class="flex flex-col gap-3 py-2">
      <div>
        <label class="text-sm font-medium mb-1 block" for="entry-key">Key <span class="text-muted-foreground text-xs">(stable identifier, e.g. ID-JKT)</span></label>
        <Input id="entry-key" bind:value={editKey} placeholder="e.g. ID-JKT" disabled={!!editEntry} />
      </div>
      <div>
        <label class="text-sm font-medium mb-1 block" for="entry-value">Value <span class="text-muted-foreground text-xs">(display name)</span></label>
        <Input id="entry-value" bind:value={editValue} placeholder="e.g. Indonesia – Jakarta" />
      </div>
      <div>
        <label class="text-sm font-medium mb-1 block" for="entry-meta">Metadata <span class="text-muted-foreground text-xs">(optional JSON object)</span></label>
        <textarea
          id="entry-meta"
          class="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono resize-y min-h-[80px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          bind:value={editMetaRaw}
          placeholder={'{"country": "ID"}'}
        ></textarea>
      </div>
      {#if editError}
        <p class="text-destructive text-sm">{editError}</p>
      {/if}
      {#if editSuccess}
        <p class="text-green-600 dark:text-green-400 text-sm">{editSuccess}</p>
      {/if}
    </div>
    <DialogFooter>
      <Button variant="outline" onclick={closeEdit}>Cancel</Button>
      <Button onclick={submitEdit} disabled={$upsertMutation.isPending}>
        {$upsertMutation.isPending ? 'Saving…' : 'Save'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

<!-- Delete confirmation dialog -->
<Dialog bind:open={deleteOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Delete entry?</DialogTitle>
      <DialogDescription>
        This will permanently remove <strong class="font-mono">{deleteTarget?.key}</strong>
        ({deleteTarget?.value}) from <strong>{selectedTaxonomyId}</strong>.
        Any H-app employment records referencing this key will break on next employment event — ensure it's no longer in use.
      </DialogDescription>
    </DialogHeader>
    {#if deleteError}
      <p class="text-destructive text-sm">{deleteError}</p>
    {/if}
    <DialogFooter>
      <Button variant="outline" onclick={() => { deleteOpen = false; deleteTarget = null }}>Cancel</Button>
      <Button variant="destructive" onclick={confirmDelete} disabled={$deleteMutation.isPending}>
        {$deleteMutation.isPending ? 'Deleting…' : 'Delete'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
