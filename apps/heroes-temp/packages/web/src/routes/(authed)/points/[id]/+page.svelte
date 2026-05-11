<script lang="ts">
  import CategoryIcon from '$lib/components/points/CategoryIcon.svelte'
  import StatusBadge from '$lib/components/points/StatusBadge.svelte'
  import PointActions from '$lib/components/points/PointActions.svelte'
  import IssueLists from '$lib/components/points/IssueLists.svelte'
  import CommentThread from '$lib/components/points/CommentThread.svelte'
  import { ArrowLeft, User } from 'lucide-svelte'
  import * as m from '$lib/paraglide/messages'

  let { data } = $props()

  const point = $derived(data.point)
  const challenges = $derived(data.challenges ?? [])
  const appeals = $derived(data.appeals ?? [])

  type CategoryCode = 'BINTANG' | 'POIN_AHA' | 'PENALTI'
  const categoryCode = $derived((point?.category?.code ?? 'BINTANG') as CategoryCode)

  const pointColor = $derived(
    categoryCode === 'PENALTI'
      ? 'text-penalti'
      : categoryCode === 'BINTANG'
        ? 'text-status-pending'
        : 'text-primary',
  )
  const prefix = $derived(categoryCode === 'PENALTI' ? '-' : '+')

  function formatDate(date: string | null | undefined) {
    if (!date) return '—'
    return new Date(date).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
</script>

<div class="max-w-2xl mx-auto p-0 min-h-screen bg-background pb-32">
  <!-- Sticky header -->
  <div
    class="sticky top-0 z-10 bg-card/90 backdrop-blur-md px-4 py-3 border-b border-border flex items-center gap-3"
  >
    <a href="/points">
      <button
        type="button"
        class="h-9 w-9 rounded-full flex items-center justify-center hover:bg-primary/8 hover:text-primary transition-colors"
        aria-label="Back"
      >
        <ArrowLeft class="h-5 w-5" />
      </button>
    </a>
    <div class="flex flex-col min-w-0">
      <div
        class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60"
      >
        <a href="/points" class="hover:text-primary transition-colors">{m.nav_points()}</a>
        <span>/</span>
        <span>{m.point_detail_title()}</span>
      </div>
      <h1 class="text-base font-bold text-foreground leading-tight truncate">
        {m.point_detail_title()}
      </h1>
    </div>
  </div>

  <div class="p-4 space-y-6">
    <!-- Main info card -->
    <div class="rounded-2xl border border-border bg-card p-5 space-y-5 shadow-card">
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-3">
          <CategoryIcon code={categoryCode} size="lg" />
          <div>
            <div class="flex items-center gap-2">
              <span class="font-bold text-base">
                {point?.category?.defaultName ?? categoryCode}
              </span>
              <StatusBadge status={point?.status ?? ''} />
            </div>
            <p class="text-xs text-muted-foreground mt-0.5 font-medium">
              {formatDate(point?.createdAt)}
            </p>
          </div>
        </div>
        <span class="text-2xl font-extrabold tracking-tight {pointColor}">
          {prefix}{point?.points?.toLocaleString()}
        </span>
      </div>

      <div class="grid gap-3">
        <!-- Recipient -->
        <div
          class="flex items-center gap-3 rounded-xl bg-muted/40 p-3 border border-border/30"
        >
          <div
            class="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 shrink-0 border border-primary/5"
          >
            <User class="h-5 w-5 text-primary" />
          </div>
          <div class="min-w-0">
            <p class="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              {m.point_detail_recipient()}
            </p>
            <p class="text-sm font-semibold truncate">{point?.user?.name ?? m.common_unknown()}</p>
            <p class="text-xs text-muted-foreground truncate">{point?.user?.email ?? ''}</p>
          </div>
        </div>

        <!-- Submitted by -->
        {#if point?.submitter}
          <div
            class="flex items-center gap-3 rounded-xl bg-muted/40 p-3 border border-border/30"
          >
            <div
              class="flex items-center justify-center h-10 w-10 rounded-full bg-muted shrink-0 border border-border/50"
            >
              <User class="h-5 w-5 text-muted-foreground" />
            </div>
            <div class="min-w-0">
              <p class="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                {m.point_detail_submitted_by()}
              </p>
              <p class="text-sm font-semibold truncate">{point.submitter.name}</p>
            </div>
          </div>
        {/if}
      </div>

      <!-- Reason -->
      {#if point?.reason}
        <div class="space-y-1">
          <p class="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            {m.point_detail_reason()}
          </p>
          <p class="text-sm leading-relaxed text-foreground/90 font-medium">{point.reason}</p>
        </div>
      {/if}

      <!-- KITTA (Penalti only) -->
      {#if categoryCode === 'PENALTI' && point?.kittaComponent}
        <div class="rounded-xl border border-destructive/15 bg-destructive/5 p-3">
          <p class="text-[10px] uppercase tracking-wider font-bold text-destructive mb-1">
            {m.point_detail_kitta_category()}
          </p>
          <p class="text-sm font-semibold text-foreground">{point.kittaComponent}</p>
        </div>
      {/if}

      <!-- Screenshot -->
      {#if point?.screenshotUrl}
        <div class="space-y-2">
          <p class="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            {m.point_detail_evidence()}
          </p>
          <div
            class="relative aspect-video rounded-xl overflow-hidden border border-border group"
          >
            <img
              src={point.screenshotUrl}
              alt={m.point_detail_evidence()}
              class="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
            />
          </div>
        </div>
      {/if}
    </div>

    <!-- Challenges & Appeals -->
    <IssueLists {challenges} {appeals} />

    <div class="h-px bg-border/50"></div>

    <!-- Comments -->
    <CommentThread entityId={point?.id ?? ''} entityType="achievement" />
  </div>

  <!-- Sticky bottom actions -->
  <div
    class="fixed bottom-0 left-0 right-0 p-4 bg-card/90 backdrop-blur-lg border-t border-border shadow-[var(--shadow-sticky-up)] max-w-2xl mx-auto z-20"
  >
    <PointActions {point} />
  </div>
</div>
