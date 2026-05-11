<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import { userState } from '$lib/state/userState.svelte'
  import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@coms-portal/ui/primitives'
  import PointCard from '$lib/components/points/PointCard.svelte'
  import PointTypeSelector from '$lib/components/points/PointTypeSelector.svelte'
  import { SlidersHorizontal, Plus, Filter } from 'lucide-svelte'
  import * as m from '$lib/paraglide/messages'
  import { buildSearchParams } from '$lib/utils'

  let { data } = $props()

  const TAB_STYLES: Record<string, { active: string }> = {
    ALL: { active: 'text-foreground border-primary/20 bg-primary/6' },
    BINTANG: { active: 'text-status-pending border-gold/30 bg-gold/10' },
    PENALTI: { active: 'text-penalti border-penalti/25 bg-penalti/8' },
    POIN_AHA: { active: 'text-primary border-primary/20 bg-primary/8' },
  }

  const tabs: Array<{ label: () => string; value: string }> = [
    { label: () => m.points_tab_all(), value: 'ALL' },
    { label: () => m.points_tab_bintang(), value: 'BINTANG' },
    { label: () => m.points_tab_penalti(), value: 'PENALTI' },
    { label: () => m.points_tab_poin_aha(), value: 'POIN_AHA' },
  ]

  const activeCategory = $derived(($page.url.searchParams.get('category') ?? 'ALL').toUpperCase())
  const activeStatus = $derived($page.url.searchParams.get('status') ?? '')
  const userRole = $derived(userState.current?.role ?? 'employee')

  let showTypeSelector = $state(false)

  function handleTabChange(tab: string) {
    const query = buildSearchParams(
      {
        category: tab === 'ALL' ? null : tab,
        page: '1',
      },
      $page.url.searchParams,
    )
    goto(`/points?${query}`)
  }

  function handleStatusChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value
    const query = buildSearchParams(
      {
        status: val || null,
        page: '1',
      },
      $page.url.searchParams,
    )
    goto(`/points?${query}`)
  }

  const totalPages = $derived(data.meta ? Math.ceil(data.meta.total / data.meta.limit) : 1)
  const currentPage = $derived(data.meta?.page ?? 1)
</script>

<div class="space-y-4 max-w-3xl mx-auto px-4 py-5 pb-28 md:pb-8">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-extrabold text-foreground">{m.nav_points()}</h1>
    {#if data.meta?.total != null}
      <span class="rounded-xl bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
        {data.meta.total} {m.nav_points().toLowerCase()}
      </span>
    {/if}
  </div>

  <!-- Category tabs -->
  <div class="flex gap-1.5 rounded-2xl bg-card border border-border p-1.5 shadow-card">
    {#each tabs as tab (tab.value)}
      {@const isActive = activeCategory === tab.value}
      {@const styles = TAB_STYLES[tab.value]}
      <button
        type="button"
        class="flex-1 rounded-xl px-2 py-2 text-xs font-bold transition-all duration-200 min-h-[44px] border {isActive ? styles.active : 'border-transparent text-muted-foreground hover:text-foreground'}"
        onclick={() => handleTabChange(tab.value)}
      >
        {tab.label()}
      </button>
    {/each}
  </div>

  <!-- Filter row -->
  <div class="flex items-center gap-2">
    <div class="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 shadow-sm">
      <Filter class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <select
        class="w-36 h-7 border-0 shadow-none bg-transparent text-sm focus:outline-none"
        value={activeStatus}
        onchange={handleStatusChange}
      >
        <option value="">{m.points_all_status()}</option>
        <option value="pending">{m.status_pending()}</option>
        <option value="active">{m.status_active()}</option>
        <option value="challenged">{m.status_challenged()}</option>
        <option value="frozen">{m.status_frozen()}</option>
        <option value="revoked">{m.status_revoked()}</option>
        <option value="rejected">{m.status_rejected()}</option>
      </select>
    </div>
  </div>

  <!-- Point cards -->
  <div class="space-y-2">
    {#if !data.points || data.points.length === 0}
      <div class="flex flex-col items-center justify-center py-14 text-center">
        <div class="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/8">
          <SlidersHorizontal class="h-8 w-8 text-primary/40" />
        </div>
        <p class="font-medium text-muted-foreground">{m.points_empty()}</p>
      </div>
    {:else}
      {#each data.points as point (point.id)}
        <PointCard
          id={point.id}
          categoryCode={(point.category?.code ?? 'BINTANG') as 'BINTANG' | 'POIN_AHA' | 'PENALTI'}
          userName={point.user?.name ?? '—'}
          reason={point.reason ?? ''}
          points={point.points}
          status={point.status}
          createdAt={point.createdAt}
        />
      {/each}
    {/if}
  </div>

  <!-- Pagination -->
  {#if totalPages > 1}
    <div class="flex items-center justify-center gap-2 pt-2">
      <Button
        variant="outline"
        size="sm"
        class="rounded-xl border-border hover:bg-primary/6 hover:text-primary min-h-[36px]"
        disabled={currentPage <= 1}
        href="/points?page={currentPage - 1}{activeStatus ? `&status=${activeStatus}` : ''}{activeCategory !== 'ALL' ? `&category=${activeCategory}` : ''}"
      >
        {m.common_previous()}
      </Button>
      <span class="rounded-xl bg-card border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground">
        {m.common_page_of({ page: String(currentPage), total: String(totalPages) })}
      </span>
      <Button
        variant="outline"
        size="sm"
        class="rounded-xl border-border hover:bg-primary/6 hover:text-primary min-h-[36px]"
        disabled={currentPage >= totalPages}
        href="/points?page={currentPage + 1}{activeStatus ? `&status=${activeStatus}` : ''}{activeCategory !== 'ALL' ? `&category=${activeCategory}` : ''}"
      >
        {m.common_next()}
      </Button>
    </div>
  {/if}
</div>

<!-- FAB -->
{#if userState.current?.canSubmitPoints}
  <button
    type="button"
    class="fixed bottom-20 right-4 flex h-14 w-14 items-center justify-center rounded-full btn-gradient-blue text-white shadow-[0_4px_20px_rgba(50,95,236,0.40)] hover:shadow-[0_6px_24px_rgba(50,95,236,0.50)] transition-all active:scale-95 md:bottom-8 md:right-8 z-40"
    onclick={() => (showTypeSelector = true)}
    aria-label={m.points_submit()}
  >
    <Plus class="h-6 w-6" />
  </button>
{/if}

<!-- Type selector dialog -->
<Dialog bind:open={showTypeSelector}>
  <DialogContent class="sm:max-w-md rounded-2xl">
    <DialogHeader>
      <DialogTitle class="text-foreground font-extrabold">{m.points_submit()}</DialogTitle>
    </DialogHeader>
    <PointTypeSelector userRole={userRole} class="mt-2" />
  </DialogContent>
</Dialog>
