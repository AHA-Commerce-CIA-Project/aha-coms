<script lang="ts">
  import { Star, Award, AlertTriangle, ChevronRight } from 'lucide-svelte'
  import { userState } from '$lib/state/userState.svelte'
  import * as m from '$lib/paraglide/messages'
  import SummaryCard from '$lib/components/dashboard/SummaryCard.svelte'
  import HeroGreeting from '$lib/components/dashboard/HeroGreeting.svelte'
  import PendingApprovalsBanner from '$lib/components/dashboard/PendingApprovalsBanner.svelte'
  import RecentActivity from '$lib/components/dashboard/RecentActivity.svelte'
  import MiniLeaderboard from '$lib/components/dashboard/MiniLeaderboard.svelte'
  import QuickActions from '$lib/components/dashboard/QuickActions.svelte'

  let { data } = $props()

  const summary = $derived(data.summary)
  const activity = $derived(data.activity)
  const leaderboard = $derived(data.leaderboard)

  const role = $derived(userState.current?.role ?? 'employee')
  const name = $derived(userState.current?.name ?? '')
  const currentUserId = $derived(userState.current?.id ?? '')

  const showPendingBanner = $derived(
    (role === 'hr' || role === 'admin') && summary.pendingCount > 0,
  )

  type LeaderboardEntry = { rank: number; name: string; avatarUrl: string | null; score: number; userId: string }
  const leaderboardEntries = $derived(
    ((leaderboard?.entries ?? []) as LeaderboardEntry[]).map((e) => ({
      rank: e.rank,
      name: e.name,
      avatarUrl: e.avatarUrl,
      score: e.score,
      userId: e.userId,
    })),
  )

  // welcome label is the part before the comma in "Welcome back, {name}"
  const welcomeLabel = $derived(m.dashboard_welcome({ name: '' }).split(',')[0])
</script>

<div class="pb-24 pt-5 md:pb-8">
  <!-- Bento grid — single col on mobile, 4-col asymmetric on desktop -->
  <div class="grid grid-cols-1 gap-4 md:grid-cols-4">

    <!-- Hero greeting — full width -->
    <div class="md:col-span-4">
      <HeroGreeting welcome={welcomeLabel} name={name} role={role} />
    </div>

    <!-- Pending approvals banner — full width, conditional -->
    {#if showPendingBanner}
      <div class="md:col-span-4">
        <PendingApprovalsBanner count={summary.pendingCount} />
      </div>
    {/if}

    <!-- Summary cards — horizontal scroll on mobile, 3-col bento on desktop -->
    <div class="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 scrollbar-hide md:grid md:grid-cols-3 md:overflow-visible md:snap-none md:pb-0 md:col-span-3">
      <div class="min-w-[140px] snap-start shrink-0 md:min-w-0 md:shrink">
        <SummaryCard
          title={m.dashboard_bintang_count()}
          value={summary.bintangCount}
          IconComponent={Star}
          variant="gold"
          href="/points?category=BINTANG"
        />
      </div>
      <div class="min-w-[140px] snap-start shrink-0 md:min-w-0 md:shrink">
        <SummaryCard
          title={m.dashboard_poin_aha_balance()}
          value={summary.poinAhaBalance}
          IconComponent={Award}
          variant="blue"
          href="/points?category=POIN_AHA"
        />
      </div>
      <div class="min-w-[140px] snap-start shrink-0 md:min-w-0 md:shrink">
        <SummaryCard
          title={m.dashboard_penalti_points()}
          value={summary.penaltiCount}
          IconComponent={AlertTriangle}
          variant="red"
          href="/points?category=PENALTI"
        />
      </div>
    </div>

    <!-- Mini Leaderboard — 1 col on desktop, spans 3 rows (cards + actions + activity) -->
    <div class="md:col-span-1 md:row-span-3">
      <MiniLeaderboard entries={leaderboardEntries} {currentUserId} />
    </div>

    <!-- Quick Actions — 3 cols -->
    <div class="md:col-span-3">
      <QuickActions {role} />
    </div>

    <!-- Recent Activity — 3 cols -->
    <div class="md:col-span-3">
      <div class="overflow-hidden rounded-2xl bg-card border border-border p-4 shadow-card">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
            {m.dashboard_recent_activity()}
          </h2>
          <a
            href="/points"
            class="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5"
          >
            {m.mini_leaderboard_view_all()}
            <ChevronRight class="h-3 w-3" />
          </a>
        </div>
        <RecentActivity items={activity} />
      </div>
    </div>

  </div>
</div>
