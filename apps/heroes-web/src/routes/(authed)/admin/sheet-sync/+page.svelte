<script lang="ts">
  import { Button, Badge, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@coms-portal/ui/primitives'
  import * as m from '$lib/paraglide/messages'
  import {
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    Loader2,
  } from 'lucide-svelte'

  let { data } = $props()

  type SyncJob = {
    id: string
    status: string
    startedAt: string
    finishedAt: string | null
    error: string | null
    rowsProcessed: number | null
  }

  type SyncStatus = {
    isRunning: boolean
    lastJob: { id: string; status: string; startedAt: string; finishedAt: string | null; error: string | null } | null
    schedule: string
  }

  let status = $derived<SyncStatus | null>((data.status as SyncStatus | null) ?? null)
  let jobs = $derived<SyncJob[]>((data.jobs as SyncJob[]) ?? [])
  let meta = $derived(data.meta ?? { total: 0, page: 1, limit: 20, totalPages: 1 })
  let page = $derived(data.meta?.page ?? 1)
  let isLoading = $state(false)
  let isTriggeringSync = $state(false)
  let syncError = $state<string | null>(null)
  let syncSuccess = $state(false)
  let showResyncConfirm = $state(false)
  let isTriggeringResync = $state(false)

  function getStatusBadgeClass(s: string): string {
    if (s === 'completed') return 'gap-1 border-status-approved/30 bg-status-approved-bg text-[11px] text-status-approved dark:bg-status-approved/20 dark:text-status-approved'
    if (s === 'failed') return 'gap-1 border-destructive/30 bg-destructive/10 text-[11px] text-destructive dark:bg-destructive/20 dark:text-destructive'
    if (s === 'in_progress') return 'gap-1 border-yellow-200 bg-yellow-50 text-[11px] text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
    return 'gap-1 border-border bg-muted text-[11px] text-muted-foreground'
  }

  function formatTimestamp(iso: string | null) {
    if (!iso) return { date: '—', time: '' }
    const d = new Date(iso)
    return {
      date: d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    }
  }

  async function fetchData(newPage: number) {
    isLoading = true
    try {
      const [statusRes, jobsRes] = await Promise.all([
        fetch('/api/v1/sheet-sync/status', { credentials: 'include' }),
        fetch(`/api/v1/sheet-sync/jobs?limit=20&page=${newPage}`, { credentials: 'include' }),
      ])
      const statusJson = await statusRes.json()
      const jobsJson = await jobsRes.json()
      status = statusJson.data as SyncStatus
      jobs = (jobsJson.data ?? []) as SyncJob[]
      meta = jobsJson.meta ?? { total: 0, page: newPage, limit: 20, totalPages: 1 }
      page = newPage
    } finally {
      isLoading = false
    }
  }

  async function handleTriggerSync() {
    syncError = null
    syncSuccess = false
    isTriggeringSync = true
    try {
      const res = await fetch('/api/v1/sheet-sync/trigger', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        syncError = json?.error?.message ?? m.common_something_wrong()
      } else {
        syncSuccess = true
        await new Promise((r) => setTimeout(r, 1500))
        await fetchData(1)
      }
    } catch {
      syncError = m.common_something_wrong()
    } finally {
      isTriggeringSync = false
    }
  }

  async function handleResync() {
    showResyncConfirm = false
    syncError = null
    isTriggeringResync = true
    try {
      const res = await fetch('/api/v1/sheet-sync/resync', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        syncError = json?.error?.message ?? m.common_something_wrong()
      } else {
        await new Promise((r) => setTimeout(r, 1500))
        await fetchData(1)
      }
    } catch {
      syncError = m.common_something_wrong()
    } finally {
      isTriggeringResync = false
    }
  }

  const lastTs = $derived(
    formatTimestamp(status?.lastJob?.finishedAt ?? status?.lastJob?.startedAt ?? null),
  )
</script>

<div class="mx-auto max-w-4xl space-y-6 p-4 pb-12">
  <!-- Header -->
  <div class="flex items-center gap-3">
    <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
      <RefreshCw class="h-5 w-5 text-foreground" />
    </div>
    <div>
      <h1 class="text-xl font-bold text-foreground">{m.nav_sheet_sync()}</h1>
      <p class="text-xs text-muted-foreground">{m.audit_subtitle()}</p>
    </div>
  </div>

  <!-- Status card -->
  <div class="space-y-4 rounded-xl border border-border bg-card p-5 shadow-card">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {m.users_col_status()}
          </span>
          {#if status?.isRunning}
            <Badge variant="outline" class="gap-1 border-yellow-200 bg-yellow-50 text-[11px] text-yellow-700">
              <Loader2 class="h-3 w-3 animate-spin" />
              running
            </Badge>
          {:else}
            <Badge variant="outline" class="border-border bg-muted text-[11px] text-muted-foreground">
              idle
            </Badge>
          {/if}
        </div>

        <div class="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
          <div>
            <p class="text-muted-foreground">Last sync</p>
            <p class="font-medium text-foreground">
              {status?.lastJob ? `${lastTs.date} ${lastTs.time}` : '—'}
            </p>
          </div>
          <div>
            <p class="text-muted-foreground">Last status</p>
            {#if status?.lastJob}
              <Badge variant="outline" class={getStatusBadgeClass(status.lastJob.status)}>
                {status.lastJob.status}
              </Badge>
            {:else}
              <span class="text-muted-foreground">—</span>
            {/if}
          </div>
          <div>
            <p class="text-muted-foreground">Scheduler</p>
            <p class="font-medium text-foreground">{status?.schedule ?? '—'}</p>
          </div>
        </div>
      </div>

      <div class="flex flex-col items-end gap-2">
        <div class="flex gap-2">
          <Button
            onclick={handleTriggerSync}
            disabled={isTriggeringSync || isTriggeringResync || !!status?.isRunning}
            class="h-9 px-5 bg-primary hover:bg-primary/80 text-primary-foreground"
          >
            {#if isTriggeringSync}
              <Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
              Syncing…
            {:else}
              <RefreshCw class="mr-1.5 h-4 w-4" />
              Sync Now
            {/if}
          </Button>
          <Button
            variant="destructive"
            onclick={() => (showResyncConfirm = true)}
            disabled={isTriggeringSync || isTriggeringResync || !!status?.isRunning}
            class="h-9 px-5"
          >
            {#if isTriggeringResync}
              <Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
              Resyncing…
            {:else}
              <RefreshCw class="mr-1.5 h-4 w-4" />
              Full Resync
            {/if}
          </Button>
        </div>
        {#if syncError}
          <p class="max-w-xs text-right text-xs text-destructive">{syncError}</p>
        {/if}
        {#if syncSuccess}
          <p class="text-xs text-status-approved">{m.settings_saved()}</p>
        {/if}
      </div>
    </div>
  </div>

  <!-- Job history -->
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold text-foreground">Sync History</h2>
      <Button
        variant="outline"
        size="sm"
        onclick={() => fetchData(page)}
        disabled={isLoading}
        class="h-8 gap-1.5 px-3 text-xs"
      >
        <RefreshCw class="h-3.5 w-3.5 {isLoading ? 'animate-spin' : ''}" />
        Refresh
      </Button>
    </div>

    {#if isLoading}
      <div class="space-y-2">
        {#each [0, 1, 2, 3, 4] as _i (_i)}
          <div class="h-14 animate-pulse rounded-xl border border-border bg-muted/50"></div>
        {/each}
      </div>
    {:else if jobs.length === 0}
      <div class="flex flex-col items-center justify-center rounded-xl border border-border py-16 text-center">
        <RefreshCw class="mb-3 h-10 w-10 text-muted-foreground/30" />
        <p class="text-sm text-muted-foreground">No sync jobs yet.</p>
      </div>
    {:else}
      <!-- Desktop table -->
      <div class="hidden overflow-hidden rounded-xl border border-border shadow-card md:block">
        <Table>
          <TableHeader>
            <TableRow class="bg-muted/60">
              <TableHead class="w-36 text-xs font-semibold text-muted-foreground">Started at</TableHead>
              <TableHead class="text-xs font-semibold text-muted-foreground">Finished at</TableHead>
              <TableHead class="text-xs font-semibold text-muted-foreground">{m.users_col_status()}</TableHead>
              <TableHead class="text-xs font-semibold text-muted-foreground">Rows</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each jobs as job (job.id)}
              {@const startTs = formatTimestamp(job.startedAt)}
              {@const endTs = formatTimestamp(job.finishedAt)}
              <TableRow class="transition-colors hover:bg-muted/30">
                <TableCell class="text-xs">
                  <span class="block font-medium text-foreground">{startTs.date}</span>
                  <span class="block text-muted-foreground">{startTs.time}</span>
                </TableCell>
                <TableCell class="text-xs text-muted-foreground">
                  {job.finishedAt ? `${endTs.date} ${endTs.time}` : '—'}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" class={getStatusBadgeClass(job.status)}>
                    {job.status}
                  </Badge>
                </TableCell>
                <TableCell class="text-sm text-foreground">{job.rowsProcessed ?? '—'}</TableCell>
              </TableRow>
            {/each}
          </TableBody>
        </Table>
      </div>

      <!-- Mobile cards -->
      <div class="space-y-3 md:hidden">
        {#each jobs as job (job.id)}
          {@const startTs = formatTimestamp(job.startedAt)}
          <div class="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
            <div class="flex items-start justify-between gap-2">
              <Badge variant="outline" class={getStatusBadgeClass(job.status)}>{job.status}</Badge>
              <span class="text-right text-[10px] text-muted-foreground">
                {startTs.date} {startTs.time}
              </span>
            </div>
            <p class="text-xs text-foreground">Rows: {job.rowsProcessed ?? '—'}</p>
          </div>
        {/each}
      </div>

      <!-- Pagination -->
      {#if meta.totalPages > 1}
        <div class="flex items-center justify-between pt-2">
          <p class="text-xs text-muted-foreground">
            Page {page} of {meta.totalPages} · {meta.total} jobs
          </p>
          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onclick={() => fetchData(page - 1)}
              class="h-8 px-3"
            >
              <ChevronLeft class="mr-1 h-3.5 w-3.5" />
              {m.common_previous()}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.totalPages || isLoading}
              onclick={() => fetchData(page + 1)}
              class="h-8 px-3"
            >
              {m.common_next()}
              <ChevronRight class="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>

<!-- Resync confirmation dialog -->
{#if showResyncConfirm}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    role="dialog"
    aria-modal="true"
  >
    <div class="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
      <h2 class="mb-2 text-sm font-semibold text-foreground">Full Resync</h2>
      <p class="mb-4 text-sm text-muted-foreground">
        This will delete all points, redemptions, and summaries, then re-import everything from the
        sheet. Are you sure?
      </p>
      <div class="flex justify-end gap-2">
        <Button variant="outline" size="sm" onclick={() => (showResyncConfirm = false)}>
          {m.common_cancel()}
        </Button>
        <Button variant="destructive" size="sm" onclick={handleResync}>Yes, Resync</Button>
      </div>
    </div>
  </div>
{/if}
