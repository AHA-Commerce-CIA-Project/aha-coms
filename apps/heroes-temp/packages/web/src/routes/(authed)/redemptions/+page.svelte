<script lang="ts">
  import { Badge, Button } from '@coms-portal/ui/primitives'
  import { userState } from '$lib/state/userState.svelte'
  import { api } from '$lib/api/client'
  import * as m from '$lib/paraglide/messages'
  import { Gift } from 'lucide-svelte'

  let { data } = $props()

  type RedemptionRow = {
    id: string
    rewardName: string
    rewardImageUrl: string | null
    pointsSpent: number
    status: 'pending' | 'approved' | 'rejected'
    rejectionReason: string | null
    approverName: string | null
    createdAt: string
    userName?: string
  }

  const isHrOrAdmin = $derived(userState.isHR)

  type Tab = 'mine' | 'pending'
  let activeTab = $state<Tab>('mine')
  let redemptions = $derived((data.redemptions.data ?? []) as RedemptionRow[])
  let isLoading = $state(false)
  let isSubmitting = $state(false)
  let rejectOpen = $state(false)
  let selectedId = $state<string | null>(null)
  let rejectionReason = $state('')

  const STATUS_CLASS: Record<string, string> = {
    pending:
      'bg-gold/15 text-status-pending border-gold/30 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800/40',
    approved:
      'bg-status-approved-bg text-status-approved border-status-approved/30 dark:bg-status-approved/20 dark:text-status-approved dark:border-status-approved/40',
    rejected:
      'bg-destructive/10 text-destructive border-destructive/30 dark:bg-destructive/20 dark:text-destructive dark:border-destructive/40',
  }

  function statusLabel(s: string) {
    if (s === 'approved') return m.status_approved()
    if (s === 'rejected') return m.status_rejected()
    return m.status_pending()
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  async function loadTab(tab: Tab) {
    isLoading = true
    try {
      const params = tab === 'mine' ? '?mine=true' : '?status=pending'
      const res = await fetch(`/api/v1/redemptions${params}`, { credentials: 'include' })
      const json = await res.json()
      redemptions = (json.data ?? []) as RedemptionRow[]
    } finally {
      isLoading = false
    }
  }

  function handleTabChange(tab: Tab) {
    activeTab = tab
    loadTab(tab)
  }

  async function handleApprove(id: string) {
    isSubmitting = true
    try {
      await api.api.v1.redemptions({ id }).approve.patch()
      await loadTab(activeTab)
    } finally {
      isSubmitting = false
    }
  }

  function openReject(id: string) {
    selectedId = id
    rejectionReason = ''
    rejectOpen = true
  }

  async function handleRejectConfirm() {
    if (!selectedId) return
    isSubmitting = true
    try {
      await api.api.v1.redemptions({ id: selectedId }).reject.patch({
        status: 'rejected',
        rejectionReason: rejectionReason.trim() || undefined,
      })
      rejectOpen = false
      selectedId = null
      await loadTab(activeTab)
    } finally {
      isSubmitting = false
    }
  }
</script>

<div class="mx-auto max-w-2xl space-y-5 p-4 page-transition">
  <!-- Header -->
  <div class="flex items-center gap-3 pt-2">
    <div
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gold to-gold-light shadow-[var(--shadow-glow-gold)]"
    >
      <Gift class="h-5 w-5 text-gold-dark" />
    </div>
    <div>
      <h1 class="text-xl font-extrabold text-foreground">{m.redemptions_title()}</h1>
      <p class="text-[13px] font-medium text-muted-foreground">{m.redemptions_my_requests()}</p>
    </div>
  </div>

  <!-- Tab switcher -->
  <div class="flex gap-1.5 rounded-2xl border border-border bg-card p-1.5 shadow-card">
    <button
      type="button"
      class="flex flex-1 min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold transition-all duration-200 {activeTab ===
      'mine'
        ? 'border border-gold/30 bg-gradient-to-br from-gold/18 to-gold/8 text-status-pending shadow-[var(--shadow-glow-gold)] dark:text-yellow-300'
        : 'text-muted-foreground hover:text-foreground'}"
      onclick={() => handleTabChange('mine')}
    >
      <Gift class="h-4 w-4" />
      {m.redemptions_my_requests()}
    </button>
    {#if isHrOrAdmin}
      <button
        type="button"
        class="flex flex-1 min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold transition-all duration-200 {activeTab ===
        'pending'
          ? 'border border-primary/30 bg-gradient-to-br from-primary/18 to-primary/8 text-primary shadow-[var(--shadow-glow-blue)]'
          : 'text-muted-foreground hover:text-foreground'}"
        onclick={() => handleTabChange('pending')}
      >
        <Gift class="h-4 w-4" />
        {m.redemptions_pending_approval()}
      </button>
    {/if}
  </div>

  <!-- Card list -->
  <div class="space-y-3">
    {#if isLoading}
      {#each [0, 1, 2, 3] as _i (_i)}
        <div class="h-24 animate-pulse rounded-xl border border-border bg-card shadow-card"></div>
      {/each}
    {:else if redemptions.length === 0}
      <div class="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div class="flex h-14 w-14 items-center justify-center rounded-full bg-gold/12">
          <Gift class="h-7 w-7 text-gold" />
        </div>
        <p class="text-sm font-medium text-muted-foreground">{m.redemptions_empty()}</p>
      </div>
    {:else}
      {#each redemptions as item (item.id)}
        <div
          class="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-card transition-all duration-200 hover:shadow-[var(--shadow-card-hover)]"
        >
          <!-- Thumbnail -->
          <div
            class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-primary/8"
          >
            {#if item.rewardImageUrl}
              <img
                src={item.rewardImageUrl}
                alt={item.rewardName}
                class="h-full w-full object-cover"
              />
            {:else}
              <Gift class="h-6 w-6 text-primary/50" />
            {/if}
          </div>

          <!-- Info -->
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <p class="line-clamp-1 text-sm font-semibold leading-snug text-foreground">
                {item.rewardName}
              </p>
              <Badge
                variant="outline"
                class="shrink-0 text-xs font-medium {STATUS_CLASS[item.status] ?? ''}"
              >
                {statusLabel(item.status)}
              </Badge>
            </div>

            {#if activeTab === 'pending' && item.userName}
              <p class="mt-0.5 text-xs text-muted-foreground">
                {m.redemptions_requested_by()}
                <span class="font-semibold text-foreground/80">{item.userName}</span>
              </p>
            {/if}

            <p class="mt-0.5 text-xs font-semibold text-primary">
              {item.pointsSpent.toLocaleString('id-ID')} {m.points_poin_aha()}
            </p>

            <div class="mt-1 flex flex-wrap items-center gap-2">
              <span class="text-xs text-muted-foreground/60">{formatDate(item.createdAt)}</span>
              {#if item.approverName && item.status !== 'pending'}
                <span class="text-xs text-muted-foreground/60">
                  ·
                  {item.status === 'approved'
                    ? m.redemptions_approved_by()
                    : m.redemptions_rejected_by()}
                  <span class="font-medium text-muted-foreground">{item.approverName}</span>
                </span>
              {/if}
              {#if item.rejectionReason}
                <span class="text-xs italic text-destructive">"{item.rejectionReason}"</span>
              {/if}
            </div>

            <!-- HR/Admin actions -->
            {#if activeTab === 'pending' && item.status === 'pending' && isHrOrAdmin}
              <div class="mt-2 flex gap-2">
                <Button
                  size="sm"
                  class="h-7 rounded-lg px-3 text-xs font-semibold bg-gradient-to-br from-primary to-sky-blue text-white"
                  disabled={isSubmitting}
                  onclick={() => handleApprove(item.id)}
                >
                  {m.common_approve()}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  class="h-7 rounded-lg border-destructive/25 px-3 text-xs font-semibold text-destructive hover:bg-destructive/8"
                  disabled={isSubmitting}
                  onclick={() => openReject(item.id)}
                >
                  {m.common_reject()}
                </Button>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<!-- Reject dialog -->
{#if rejectOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    role="dialog"
    aria-modal="true"
  >
    <div class="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
      <h2 class="mb-4 text-base font-bold text-foreground">{m.redemptions_reject_title()}</h2>
      <div class="space-y-2">
        <label class="text-sm font-medium text-foreground" for="rejection-reason">
          {m.redemptions_reject_reason_label()}
        </label>
        <textarea
          id="rejection-reason"
          class="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          rows="3"
          placeholder={m.redemptions_reject_placeholder()}
          bind:value={rejectionReason}
        ></textarea>
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={isSubmitting}
          onclick={() => (rejectOpen = false)}
        >
          {m.common_cancel()}
        </Button>
        <Button
          size="sm"
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          disabled={isSubmitting}
          onclick={handleRejectConfirm}
        >
          {isSubmitting ? m.redemptions_rejecting() : m.redemptions_confirm_reject()}
        </Button>
      </div>
    </div>
  </div>
{/if}
