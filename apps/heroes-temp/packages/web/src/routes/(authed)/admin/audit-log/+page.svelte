<script lang="ts">
  import { Button, Badge, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@coms-portal/ui/primitives'
  import * as m from '$lib/paraglide/messages'
  import { buildSearchParams } from '$lib/utils'
  import { Shield, Search, ChevronLeft, ChevronRight } from 'lucide-svelte'

  let { data } = $props()

  type AuditLog = {
    id: string
    createdAt: string
    action: string
    entityType: string | null
    entityId: string | null
    actorId: string | null
    actorName: string | null
  }

  let logs = $derived((data.logs ?? []) as AuditLog[])
  let meta = $derived(data.meta ?? { total: 0, page: 1, limit: 50 })
  let isLoading = $state(false)

  // Filter state
  let actionGroup = $state('')
  let entityType = $state('')
  let startDate = $state('')
  let endDate = $state('')
  let actor = $state('')
  let currentPage = $derived(data.meta?.page ?? 1)
  const totalPages = $derived(Math.ceil(meta.total / (meta.limit ?? 50)))

  const ACTION_GROUPS = [
    { value: '', label: () => m.audit_group_all() },
    { value: 'POINT_', label: () => m.audit_group_points() },
    { value: 'CHALLENGE_', label: () => m.audit_group_challenges() },
    { value: 'APPEAL_', label: () => m.audit_group_appeals() },
    { value: 'REDEMPTION_', label: () => m.audit_group_redemptions() },
    { value: 'USER_', label: () => m.audit_group_users() },
    { value: 'TEAM_', label: () => m.audit_group_teams() },
  ]

  function getActionBadgeClass(action: string): string {
    if (action.startsWith('POINT_SUBMITTED') || action.startsWith('POINT_APPROVED'))
      return 'bg-primary/10 text-primary border-primary/25 dark:bg-primary/20 dark:text-primary'
    if (action.startsWith('POINT_REJECTED') || action.startsWith('POINT_REVOKED'))
      return 'bg-destructive/10 text-destructive border-destructive/25 dark:bg-destructive/20 dark:text-destructive'
    if (action.startsWith('CHALLENGE_') || action.startsWith('APPEAL_'))
      return 'bg-purple/10 text-purple border-purple/25 dark:bg-purple/20 dark:text-purple-light'
    if (action.startsWith('REDEMPTION_'))
      return 'bg-status-approved-bg text-status-approved border-status-approved/25 dark:bg-status-approved/20 dark:text-status-approved'
    if (action.startsWith('USER_') || action.startsWith('TEAM_'))
      return 'bg-muted text-muted-foreground border-border'
    return 'bg-muted text-muted-foreground border-border'
  }

  function formatTimestamp(iso: string) {
    const d = new Date(iso)
    return {
      date: d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    }
  }

  async function fetchLogs(opts?: { page?: number }) {
    isLoading = true
    const pg = opts?.page ?? currentPage
    try {
      const query = buildSearchParams({
        page: String(pg),
        limit: String(meta.limit ?? 50),
        action: actionGroup,
        entityType,
        startDate,
        endDate,
        actorId: actor,
      })
      const res = await fetch(`/api/v1/audit-logs?${query}`, { credentials: 'include' })
      const json = await res.json()
      logs = (json.data ?? []) as AuditLog[]
      meta = json.meta ?? { total: 0, page: pg, limit: 50 }
      currentPage = pg
    } finally {
      isLoading = false
    }
  }

  function handleActionGroup(val: string) {
    actionGroup = val
    currentPage = 1
    fetchLogs({ page: 1 })
  }

  function handleSearch() {
    currentPage = 1
    fetchLogs({ page: 1 })
  }
</script>

<div class="mx-auto max-w-4xl space-y-6 p-4 pb-12">
  <!-- Header -->
  <div class="flex items-center gap-3">
    <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
      <Shield class="h-5 w-5 text-foreground" />
    </div>
    <div>
      <h1 class="text-xl font-bold text-foreground">{m.audit_title()}</h1>
      <p class="text-xs text-muted-foreground">{m.audit_subtitle()}</p>
    </div>
  </div>

  <!-- Filter bar -->
  <div class="space-y-4 rounded-xl border border-border bg-card p-4 shadow-card">
    <!-- Action group pills -->
    <div class="flex flex-wrap gap-2">
      {#each ACTION_GROUPS as group (group.value)}
        <button
          type="button"
          onclick={() => handleActionGroup(group.value)}
          class="rounded-full border px-3 py-1 text-xs font-medium transition-colors {actionGroup ===
          group.value
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-primary/5 text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary'}"
        >
          {group.label()}
        </button>
      {/each}
    </div>

    <!-- Secondary filters -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
      <div class="relative">
        <Search class="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder={m.audit_actor_placeholder()}
          bind:value={actor}
          class="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <input
        type="text"
        placeholder={m.audit_entity_type_placeholder()}
        bind:value={entityType}
        class="h-9 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <input
        type="date"
        bind:value={startDate}
        class="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <input
        type="date"
        bind:value={endDate}
        class="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
    <div class="flex justify-end">
      <Button
        size="sm"
        onclick={handleSearch}
        disabled={isLoading}
        class="h-9 px-5 bg-primary hover:bg-primary/80 text-primary-foreground"
      >
        {isLoading ? m.common_loading() : m.audit_apply_filters()}
      </Button>
    </div>
  </div>

  <!-- Content -->
  {#if isLoading}
    <div class="space-y-2">
      {#each [0, 1, 2, 3, 4, 5] as _i (_i)}
        <div class="h-14 animate-pulse rounded-xl border border-border bg-muted/50"></div>
      {/each}
    </div>
  {:else if logs.length === 0}
    <div class="flex flex-col items-center justify-center py-16 text-center">
      <Shield class="mb-3 h-10 w-10 text-muted-foreground/30" />
      <p class="text-sm text-muted-foreground">{m.audit_empty()}</p>
    </div>
  {:else}
    <!-- Desktop table -->
    <div class="hidden overflow-hidden rounded-xl border border-border shadow-card md:block">
      <Table>
        <TableHeader>
          <TableRow class="bg-muted/60">
            <TableHead class="w-36 text-xs font-semibold text-muted-foreground">{m.audit_col_timestamp()}</TableHead>
            <TableHead class="text-xs font-semibold text-muted-foreground">{m.audit_col_actor()}</TableHead>
            <TableHead class="text-xs font-semibold text-muted-foreground">{m.audit_col_action()}</TableHead>
            <TableHead class="text-xs font-semibold text-muted-foreground">{m.audit_col_entity_type()}</TableHead>
            <TableHead class="text-xs font-semibold text-muted-foreground">{m.audit_col_entity_id()}</TableHead>
            <TableHead class="text-xs font-semibold text-muted-foreground">{m.audit_col_details()}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {#each logs as log (log.id)}
            {@const ts = formatTimestamp(log.createdAt)}
            <TableRow class="transition-colors hover:bg-muted/30">
              <TableCell class="text-xs">
                <span class="block font-medium text-foreground">{ts.date}</span>
                <span class="block text-muted-foreground">{ts.time}</span>
              </TableCell>
              <TableCell>
                <span class="text-xs font-medium text-foreground">
                  {log.actorName ?? log.actorId ?? '—'}
                </span>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  class="font-mono text-[10px] px-2 py-0.5 {getActionBadgeClass(log.action)}"
                >
                  {log.action}
                </Badge>
              </TableCell>
              <TableCell class="text-xs text-muted-foreground">{log.entityType ?? '—'}</TableCell>
              <TableCell class="max-w-[100px] truncate font-mono text-xs text-muted-foreground">
                {log.entityId ?? '—'}
              </TableCell>
              <TableCell class="text-xs text-muted-foreground">—</TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    </div>

    <!-- Mobile cards -->
    <div class="space-y-3 md:hidden">
      {#each logs as log (log.id)}
        {@const ts = formatTimestamp(log.createdAt)}
        <div class="space-y-3 rounded-xl border border-border bg-card p-4">
          <div class="flex items-start justify-between gap-2">
            <Badge
              variant="outline"
              class="shrink-0 font-mono text-[10px] px-2 py-0.5 {getActionBadgeClass(log.action)}"
            >
              {log.action}
            </Badge>
            <span class="text-right text-[10px] text-muted-foreground">{ts.date} {ts.time}</span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p class="mb-0.5 text-muted-foreground">{m.audit_col_actor()}</p>
              <p class="font-medium text-foreground">{log.actorName ?? log.actorId ?? '—'}</p>
            </div>
            <div>
              <p class="mb-0.5 text-muted-foreground">{m.audit_entity_label()}</p>
              <p class="font-medium text-foreground">{log.entityType ?? '—'}</p>
              <p class="truncate font-mono text-[10px] text-muted-foreground">
                {log.entityId ?? '—'}
              </p>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Pagination -->
    <div class="flex items-center justify-between pt-2">
      <p class="text-xs text-muted-foreground">
        {m.common_page_of({ page: String(currentPage), total: String(totalPages) })} ·
        {m.audit_total({ total: String(meta.total) })}
      </p>
      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage <= 1 || isLoading}
          onclick={() => fetchLogs({ page: currentPage - 1 })}
          class="h-8 px-3"
        >
          <ChevronLeft class="mr-1 h-3.5 w-3.5" />
          {m.common_previous()}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage >= totalPages || isLoading}
          onclick={() => fetchLogs({ page: currentPage + 1 })}
          class="h-8 px-3"
        >
          {m.common_next()}
          <ChevronRight class="ml-1 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  {/if}
</div>
