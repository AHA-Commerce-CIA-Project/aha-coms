<script lang="ts">
  import { goto } from '$app/navigation'
  import { Button, Badge } from '@coms-portal/ui/primitives'
  import { api } from '$lib/api/client'
  import { getErrorMessage } from '$lib/api/client'
  import * as m from '$lib/paraglide/messages'
  import { Gift, Coins, ArrowLeft, CheckCircle } from 'lucide-svelte'

  let { data } = $props()

  const reward = $derived(data.reward)

  let notes = $state('')
  let submitting = $state(false)
  let error = $state<string | null>(null)
  let success = $state(false)

  async function handleRedeem() {
    submitting = true
    error = null
    try {
      const result = await api.api.v1.redemptions.post({
        rewardId: reward.id,
        notes: notes.trim() || undefined,
      })
      if (result.error) {
        error = getErrorMessage(result.error, m.redeem_failed())
        return
      }
      success = true
      setTimeout(() => goto('/redemptions'), 1800)
    } catch (e) {
      error = e instanceof Error ? e.message : m.common_something_wrong()
    } finally {
      submitting = false
    }
  }
</script>

<div class="mx-auto max-w-lg space-y-5 p-4 pb-24 pt-5 md:pb-8">
  <!-- Back nav -->
  <div class="flex items-center gap-2">
    <a
      href="/rewards"
      class="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-primary/8 hover:text-primary"
      aria-label={m.common_previous()}
    >
      <ArrowLeft class="h-5 w-5" />
    </a>
    <h1 class="text-xl font-extrabold text-foreground">{m.redeem_title()}</h1>
  </div>

  <!-- Reward card -->
  <div class="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
    {#if reward.imageUrl}
      <div class="aspect-video w-full overflow-hidden bg-muted">
        <img src={reward.imageUrl} alt={reward.name} class="h-full w-full object-cover" />
      </div>
    {:else}
      <div class="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
        <Gift class="h-16 w-16 text-primary/30" />
      </div>
    {/if}

    <div class="p-5">
      <h2 class="text-lg font-extrabold text-foreground">{reward.name}</h2>
      {#if reward.description}
        <p class="mt-1 text-sm text-muted-foreground">{reward.description}</p>
      {/if}

      <!-- Cost badge -->
      <div class="mt-3 flex items-center gap-2">
        <div class="flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-1.5">
          <Coins class="h-4 w-4 text-primary" />
          <span class="text-sm font-extrabold text-primary">
            {reward.pointCost.toLocaleString('id-ID')} {m.points_poin_aha()}
          </span>
        </div>
      </div>
    </div>
  </div>

  {#if !reward.isActive}
    <div class="rounded-2xl border border-border bg-card p-5 shadow-card">
      <Badge variant="destructive" class="w-full justify-center py-2 text-sm">
        {m.status_inactive()}
      </Badge>
    </div>
  {:else if success}
    <div
      class="flex flex-col items-center gap-3 rounded-2xl border border-status-approved/30 bg-status-approved-bg p-8 text-center shadow-card dark:border-status-approved/40 dark:bg-status-approved/20"
    >
      <CheckCircle class="h-12 w-12 text-status-approved" />
      <p class="font-bold text-status-approved">{m.settings_saved()}</p>
      <p class="text-sm text-muted-foreground">{m.common_loading()}</p>
    </div>
  {:else}
    <!-- Form -->
    <div class="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div class="space-y-4">
        <div class="space-y-1.5">
          <label for="notes" class="text-sm font-semibold text-foreground">
            {m.redeem_notes_label()}
          </label>
          <textarea
            id="notes"
            bind:value={notes}
            placeholder={m.redeem_notes_placeholder()}
            rows="3"
            class="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
          ></textarea>
        </div>

        {#if error}
          <div class="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        {/if}

        <div class="flex gap-3">
          <Button variant="outline" href="/rewards" class="flex-1 rounded-xl">
            {m.common_cancel()}
          </Button>
          <Button
            onclick={handleRedeem}
            disabled={submitting}
            class="flex-1 rounded-xl bg-gradient-to-br from-primary to-sky-blue font-bold text-white shadow-[var(--shadow-glow-blue)]"
          >
            {submitting ? m.common_submitting() : m.redeem_submit()}
          </Button>
        </div>
      </div>
    </div>
  {/if}
</div>
