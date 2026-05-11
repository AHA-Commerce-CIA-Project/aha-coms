<script lang="ts">
  import { Button, Badge } from '@coms-portal/ui/primitives'
  import * as m from '$lib/paraglide/messages'
  import { userState } from '$lib/state/userState.svelte'
  import { Gift, Coins, Plus } from 'lucide-svelte'

  let { data } = $props()

  const rewards = $derived(data.rewards.data ?? [])
  const isAdmin = $derived(userState.isHR)
</script>

<div class="mx-auto max-w-2xl space-y-5 p-4 pb-24 md:pb-8">
  <!-- Hero balance bar -->
  <div
    class="relative overflow-hidden rounded-2xl bg-gradient-hero p-5 shadow-[var(--shadow-card)]"
  >
    <div
      class="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-gold/15 blur-2xl"
    ></div>
    <div
      class="pointer-events-none absolute bottom-0 left-8 h-16 w-24 rounded-full bg-sky-blue/20 blur-xl"
    ></div>

    <div class="relative flex items-center justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wider text-white/50">
          {m.rewards_your_balance()}
        </p>
        <div class="mt-1 flex items-baseline gap-1.5">
          <span class="text-3xl font-extrabold tracking-tight text-white">0</span>
          <span class="text-sm font-semibold text-white/60">Poin AHA</span>
        </div>
      </div>
      <div
        class="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm"
      >
        <Coins class="h-7 w-7 text-gold" />
      </div>
    </div>
  </div>

  <!-- Header row -->
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-extrabold text-foreground">{m.rewards_catalog_title()}</h1>
    {#if isAdmin}
      <Button
        size="sm"
        class="h-9 gap-1.5 rounded-xl bg-gradient-to-br from-primary to-sky-blue px-4 font-bold text-white shadow-[var(--shadow-card)]"
      >
        <Plus class="h-4 w-4" />
        {m.rewards_add()}
      </Button>
    {/if}
  </div>

  <!-- Grid -->
  {#if rewards.length === 0}
    <div class="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div class="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/8">
        <Gift class="h-10 w-10 text-primary/40" />
      </div>
      <div>
        <p class="font-bold text-foreground">{m.rewards_empty()}</p>
        <p class="mt-1 text-sm text-muted-foreground">
          {isAdmin ? m.rewards_empty_admin() : m.rewards_empty_user()}
        </p>
      </div>
    </div>
  {:else}
    <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
      {#each rewards as reward, i (reward.id)}
        <div
          class="stagger-item overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] {reward.isActive
            ? ''
            : 'opacity-60'}"
          style="animation-delay:{i * 40}ms"
        >
          <!-- Image / placeholder -->
          {#if reward.imageUrl}
            <div class="aspect-video w-full overflow-hidden bg-muted">
              <img src={reward.imageUrl} alt={reward.name} class="h-full w-full object-cover" />
            </div>
          {:else}
            <div class="flex aspect-video w-full items-center justify-center bg-primary/5">
              <Gift class="h-10 w-10 text-primary/30" />
            </div>
          {/if}

          <div class="p-3">
            <p class="line-clamp-2 text-sm font-bold leading-snug text-foreground">{reward.name}</p>
            {#if reward.description}
              <p class="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{reward.description}</p>
            {/if}

            <div class="mt-3 flex items-center justify-between gap-2">
              <Badge
                variant="outline"
                class="gap-1 border-primary/25 bg-primary/8 text-primary dark:border-sky-blue/30 dark:bg-primary/15 dark:text-sky-blue"
              >
                {reward.pointCost.toLocaleString('id-ID')} pts
              </Badge>
              {#if reward.isActive}
                <Button
                  href="/rewards/{reward.id}/redeem"
                  size="sm"
                  class="h-7 rounded-xl px-3 text-xs font-bold"
                >
                  {m.redeem_title()}
                </Button>
              {:else}
                <Badge variant="secondary" class="text-xs">{m.status_inactive()}</Badge>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
