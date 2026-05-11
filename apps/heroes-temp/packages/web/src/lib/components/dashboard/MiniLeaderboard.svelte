<script lang="ts">
  import { ChevronRight, Crown, Trophy } from 'lucide-svelte'
  import * as m from '$lib/paraglide/messages'

  type LeaderboardEntry = {
    rank: number
    name: string
    avatarUrl: string | null
    score: number
    userId: string
  }

  let {
    entries,
    currentUserId,
  }: {
    entries: LeaderboardEntry[]
    currentUserId: string
  } = $props()

  function getInitials(name: string): string {
    return name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
  }

  const RANK_MEDAL: Record<number, { ring: string; bg: string }> = {
    1: { ring: 'ring-2 ring-gold/60', bg: 'bg-gold/15' },
    2: { ring: 'ring-2 ring-silver/60', bg: 'bg-silver/10' },
    3: { ring: 'ring-2 ring-bronze/60', bg: 'bg-bronze/10' },
  }

  const RANK_NUM_STYLE: Record<number, string> = {
    1: 'text-gold font-extrabold',
    2: 'text-silver-dark font-bold',
    3: 'text-bronze font-bold',
  }
</script>

<div class="overflow-hidden rounded-2xl bg-card border border-gold/15 shadow-card">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-border">
    <div class="flex items-center gap-2">
      <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-gold/15">
        <Trophy class="h-3.5 w-3.5 text-gold" />
      </div>
      <h3 class="text-sm font-bold text-foreground">{m.mini_leaderboard_title()}</h3>
    </div>
    <a
      href="/leaderboard"
      class="group flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/8 transition-colors"
    >
      {m.mini_leaderboard_view_all()}
      <ChevronRight class="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
    </a>
  </div>

  {#if entries.length === 0}
    <p class="py-8 text-center text-sm text-muted-foreground">{m.common_no_data()}</p>
  {:else}
    <ul class="divide-y divide-border/50">
      {#each entries as entry (entry.userId)}
        {@const isCurrentUser = entry.userId === currentUserId}
        {@const medal = RANK_MEDAL[entry.rank]}
        {@const numStyle = RANK_NUM_STYLE[entry.rank]}
        <li class="tap-active flex items-center gap-2.5 px-4 py-2.5 transition-colors
          {isCurrentUser ? 'bg-gradient-to-r from-primary/6 to-transparent' : 'hover:bg-primary/4'}">

          <!-- Rank -->
          <span class="flex w-5 shrink-0 items-center justify-center text-sm {numStyle ?? 'text-muted-foreground text-xs font-medium'}">
            {#if entry.rank === 1}
              <Crown class="h-4 w-4 text-gold" />
            {:else}
              {entry.rank}
            {/if}
          </span>

          <!-- Avatar -->
          <div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 {medal?.ring ?? ''}">
            {#if entry.avatarUrl}
              <img
                src={entry.avatarUrl}
                alt={entry.name}
                class="h-full w-full object-cover"
                width="32"
                height="32"
                loading="lazy"
                decoding="async"
              />
            {:else}
              <span class="text-[10px] font-bold text-primary">{getInitials(entry.name)}</span>
            {/if}
          </div>

          <!-- Name -->
          <span class="flex-1 truncate text-sm font-medium text-foreground">
            {entry.name}
            {#if isCurrentUser}
              <span class="ml-1.5 rounded-full bg-gradient-to-r from-primary to-sky-blue px-1.5 py-0.5 text-[9px] font-bold text-white">
                {m.mini_leaderboard_you()}
              </span>
            {/if}
          </span>

          <!-- Score -->
          <span class="shrink-0 rounded-lg bg-primary/8 px-2 py-0.5 text-xs font-extrabold text-primary">
            {entry.score.toLocaleString()}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
