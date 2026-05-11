<script lang="ts">
  import { Card, CardContent, CardHeader, CardTitle } from '@coms-portal/ui/primitives'
  import * as m from '$lib/paraglide/messages'
  import { BarChart3, FileText, Star, AlertTriangle, Award, ShieldOff } from 'lucide-svelte'
  import { userState } from '$lib/state/userState.svelte'

  let { data } = $props()

  type ReportsData = {
    totalSubmissions: number
    byCategory: Array<{ name: string; count: number }>
    byTeam: Array<{ name: string; total: number }>
    overTime: Array<{ date: string; count: number }>
  }

  const isHrOrAdmin = $derived(userState.isHR)

  let startDate = $derived(data.defaultStart ?? '')
  let endDate = $derived(data.defaultEnd ?? '')
  let reports = $derived<ReportsData>(
    (data.reports as ReportsData) ?? {
      totalSubmissions: 0,
      byCategory: [],
      byTeam: [],
      overTime: [],
    },
  )
  let isLoading = $state(false)

  const CATEGORY_COLORS: Record<string, { bar: string; text: string }> = {
    bintang: { bar: 'bg-gold', text: 'text-gold' },
    penalti: { bar: 'bg-penalti', text: 'text-penalti' },
    poin_aha: { bar: 'bg-primary', text: 'text-primary' },
  }

  function categoryColor(name: string) {
    const key = name.toLowerCase().replace(/\s+/g, '_')
    if (key.includes('bintang')) return CATEGORY_COLORS.bintang
    if (key.includes('penalti')) return CATEGORY_COLORS.penalti
    return CATEGORY_COLORS.poin_aha
  }

  async function fetchReports() {
    isLoading = true
    try {
      const res = await fetch(
        `/api/v1/reports?startDate=${startDate}&endDate=${endDate}`,
        { credentials: 'include' },
      )
      const json = await res.json()
      reports = (json.data ?? json) as ReportsData
    } finally {
      isLoading = false
    }
  }

  const byCategory = $derived(reports.byCategory ?? [])
  const byTeam = $derived(reports.byTeam ?? [])
  const overTime = $derived(reports.overTime ?? [])

  const bintangCount = $derived(byCategory.find((c) => c.name.toLowerCase().includes('bintang'))?.count ?? 0)
  const penaltiCount = $derived(byCategory.find((c) => c.name.toLowerCase().includes('penalti'))?.count ?? 0)
  const poinAhaCount = $derived(byCategory.find((c) => c.name.toLowerCase().includes('poin'))?.count ?? 0)

  const maxCategoryCount = $derived(Math.max(...byCategory.map((c) => c.count), 1))
  const maxTeamTotal = $derived(Math.max(...byTeam.map((t) => t.total), 1))
  const maxTimeCount = $derived(Math.max(...overTime.map((o) => o.count), 1))
</script>

{#if !isHrOrAdmin}
  <div class="flex flex-col items-center justify-center px-4 py-24 text-center">
    <ShieldOff class="mb-4 h-12 w-12 text-muted-foreground/40" />
    <h2 class="text-lg font-semibold text-foreground">{m.common_access_denied()}</h2>
    <p class="mt-1 text-sm text-muted-foreground">{m.common_no_permission()}</p>
  </div>
{:else}
  <div class="mx-auto max-w-4xl space-y-6 p-4 pb-24 md:pb-8">
    <!-- Header -->
    <div class="flex items-center gap-3 pt-2">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
        <BarChart3 class="h-5 w-5 text-primary" />
      </div>
      <div>
        <h1 class="text-xl font-bold text-foreground">{m.reports_title()}</h1>
        <p class="text-xs text-muted-foreground">{m.reports_subtitle()}</p>
      </div>
    </div>

    <!-- Filter bar -->
    <Card class="border-border shadow-card">
      <CardContent class="flex flex-wrap items-end gap-3 p-4">
        <div class="flex flex-col gap-1">
          <label for="admin-reports-start-date" class="text-xs font-medium text-muted-foreground">{m.reports_start_date()}</label>
          <input
            id="admin-reports-start-date"
            type="date"
            bind:value={startDate}
            max={endDate}
            onchange={fetchReports}
            class="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label for="admin-reports-end-date" class="text-xs font-medium text-muted-foreground">{m.reports_end_date()}</label>
          <input
            id="admin-reports-end-date"
            type="date"
            bind:value={endDate}
            min={startDate}
            onchange={fetchReports}
            class="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        {#if isLoading}
          <span class="pb-1 text-xs text-muted-foreground animate-pulse">{m.common_loading()}</span>
        {/if}
      </CardContent>
    </Card>

    <!-- Summary cards -->
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div class="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-card">
        <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-blue/15">
          <FileText class="h-5 w-5 text-sky-blue" />
        </div>
        <p class="text-2xl font-extrabold text-foreground">{reports.totalSubmissions}</p>
        <p class="text-xs font-medium text-muted-foreground">{m.reports_total_submissions()}</p>
      </div>
      <div class="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-card">
        <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/15">
          <Star class="h-5 w-5 text-gold" />
        </div>
        <p class="text-2xl font-extrabold text-gold-dark">{bintangCount}</p>
        <p class="text-xs font-medium text-muted-foreground">{m.points_bintang()}</p>
      </div>
      <div class="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-card">
        <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-penalti/10">
          <AlertTriangle class="h-5 w-5 text-penalti" />
        </div>
        <p class="text-2xl font-extrabold text-penalti">{penaltiCount}</p>
        <p class="text-xs font-medium text-muted-foreground">{m.points_penalti()}</p>
      </div>
      <div class="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-card">
        <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
          <Award class="h-5 w-5 text-primary" />
        </div>
        <p class="text-2xl font-extrabold text-primary">{poinAhaCount}</p>
        <p class="text-xs font-medium text-muted-foreground">{m.points_poin_aha()}</p>
      </div>
    </div>

    <!-- By Category -->
    <Card class="border-border shadow-card">
      <CardHeader class="pb-2">
        <CardTitle class="text-sm font-semibold text-foreground">{m.reports_by_category()}</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3 p-4 pt-0">
        {#if byCategory.length === 0}
          <p class="py-4 text-center text-sm text-muted-foreground">{m.common_no_data()}</p>
        {:else}
          {#each byCategory as cat (cat.name)}
            {@const color = categoryColor(cat.name)}
            <div class="flex items-center gap-3">
              <span class="w-32 shrink-0 truncate text-sm text-muted-foreground">{cat.name}</span>
              <div class="relative h-5 flex-1 overflow-hidden rounded-full bg-primary/15">
                <div
                  class="h-full rounded-full transition-all duration-500 {color.bar}"
                  style="width:{Math.max(4, Math.round((cat.count / maxCategoryCount) * 100))}%"
                ></div>
              </div>
              <span class="w-8 shrink-0 text-right text-sm font-semibold text-foreground"
                >{cat.count}</span
              >
            </div>
          {/each}
        {/if}
      </CardContent>
    </Card>

    <!-- Top Teams -->
    <Card class="border-border shadow-card">
      <CardHeader class="pb-2">
        <CardTitle class="text-sm font-semibold text-foreground">{m.reports_top_teams()}</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3 p-4 pt-0">
        {#if byTeam.length === 0}
          <p class="py-4 text-center text-sm text-muted-foreground">{m.common_no_data()}</p>
        {:else}
          {#each byTeam as team (team.name)}
            <div class="flex items-center gap-3">
              <span class="w-28 shrink-0 truncate text-sm text-muted-foreground">{team.name}</span>
              <div class="relative h-5 flex-1 overflow-hidden rounded-full bg-primary/15">
                <div
                  class="h-full rounded-full bg-primary transition-all duration-500"
                  style="width:{Math.max(4, Math.round((team.total / maxTeamTotal) * 100))}%"
                ></div>
              </div>
              <span class="w-8 shrink-0 text-right text-sm font-semibold text-foreground"
                >{team.total}</span
              >
            </div>
          {/each}
        {/if}
      </CardContent>
    </Card>

    <!-- Submissions Over Time -->
    <Card class="border-border shadow-card">
      <CardHeader class="pb-2">
        <CardTitle class="text-sm font-semibold text-foreground">{m.reports_over_time()}</CardTitle>
      </CardHeader>
      <CardContent class="p-4 pt-0">
        {#if overTime.length === 0}
          <p class="py-4 text-center text-sm text-muted-foreground">{m.common_no_data()}</p>
        {:else}
          <div class="overflow-x-auto">
            <div
              class="flex min-w-0 items-end gap-1.5"
              style="min-width:{overTime.length * 36}px"
            >
              {#each overTime as point (point.date)}
                {@const heightPct = Math.max(8, Math.round((point.count / maxTimeCount) * 100))}
                {@const shortDate = String(point.date).slice(5)}
                <div class="flex flex-1 flex-col items-center gap-1">
                  <span class="text-[10px] font-medium text-foreground">{point.count}</span>
                  <div
                    class="w-full rounded-t-md bg-primary transition-all duration-500"
                    style="height:{heightPct * 1.2}px;min-height:8px"
                    title="{String(point.date)}: {point.count}"
                  ></div>
                  <span class="origin-left rotate-45 text-[9px] text-muted-foreground">
                    {shortDate}
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </CardContent>
    </Card>
  </div>
{/if}
