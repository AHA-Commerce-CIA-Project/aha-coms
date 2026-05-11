<script lang="ts">
  import { Button } from '@coms-portal/ui/primitives'
  import * as m from '$lib/paraglide/messages'
  import { Settings, AlertTriangle, Save, Globe, Tag } from 'lucide-svelte'

  let { data } = $props()

  type Setting = { key: string; value: string; description: string | null; updatedAt: string }

  const settings = $derived((data.settings ?? []) as Setting[])

  function findValue(key: string, fallback: number): number {
    const entry = settings.find((s) => s.key === key)
    return entry !== undefined ? Number(entry.value) : fallback
  }

  let bintangImpact = $state(findValue('bintang_impact', 10))
  let penaltiImpact = $state(findValue('penalti_impact', -5))
  let saving = $state(false)
  let saveError = $state<string | null>(null)
  let saveSuccess = $state(false)

  const BRANCHES = [
    { name: 'Indonesia', timezone: 'Asia/Jakarta (GMT+7)' },
    { name: 'Thailand', timezone: 'Asia/Bangkok (GMT+7)' },
  ]

  const POINT_CATEGORIES = [
    { name: 'Bintang sAHAbat', type: 'bintang', active: true },
    { name: 'Penalti', type: 'penalti', active: true },
    { name: 'Poin AHA', type: 'poin_aha', active: true },
  ]

  async function handleSaveImpacts() {
    saving = true
    saveError = null
    saveSuccess = false
    try {
      await Promise.all([
        fetch('/api/v1/settings', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'bintang_impact', value: bintangImpact }),
        }),
        fetch('/api/v1/settings', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'penalti_impact', value: penaltiImpact }),
        }),
      ])
      saveSuccess = true
    } catch (err) {
      saveError = err instanceof Error ? err.message : m.settings_save_failed()
    } finally {
      saving = false
    }
  }
</script>

<div class="mx-auto max-w-2xl space-y-6 p-4 pb-24 pt-6 md:pb-8 page-transition">
  <!-- Header -->
  <div class="flex items-center gap-3">
    <div
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-sky-blue shadow-[var(--shadow-glow-blue)]"
    >
      <Settings class="h-5 w-5 text-white" />
    </div>
    <div>
      <h1 class="text-xl font-extrabold text-foreground">{m.settings_title()}</h1>
      <p class="text-[13px] font-medium text-muted-foreground">{m.settings_admin_only()}</p>
    </div>
  </div>

  <!-- Section 1: Point Impact Values -->
  <div class="rounded-xl border border-border bg-card p-5 shadow-card">
    <div class="mb-1 flex items-center gap-2">
      <Tag class="h-4 w-4 text-primary" />
      <h2 class="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
        {m.settings_point_impact()}
      </h2>
    </div>

    <div class="mt-4 space-y-4">
      <div class="space-y-1.5">
        <label for="bintang-impact" class="text-sm font-semibold text-foreground">
          {m.settings_bintang_impact()}
        </label>
        <input
          id="bintang-impact"
          type="number"
          bind:value={bintangImpact}
          placeholder="+10"
          class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div class="space-y-1.5">
        <label for="penalti-impact" class="text-sm font-semibold text-foreground">
          {m.settings_penalti_impact()}
        </label>
        <input
          id="penalti-impact"
          type="number"
          bind:value={penaltiImpact}
          placeholder="-5"
          class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <!-- Warning -->
      <div
        class="flex items-start gap-2.5 rounded-xl border border-gold/25 bg-gold/10 px-4 py-3 text-sm text-gold-dark dark:border-yellow-800/40 dark:bg-yellow-900/20 dark:text-yellow-300"
      >
        <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-gold" />
        <span>{m.settings_impact_warning()}</span>
      </div>

      {#if saveError}
        <p class="text-sm font-medium text-destructive">{saveError}</p>
      {/if}
      {#if saveSuccess}
        <p class="text-sm font-medium text-status-approved">
          {m.settings_saved()}
        </p>
      {/if}

      <Button
        onclick={handleSaveImpacts}
        disabled={saving}
        class="w-full rounded-xl bg-gradient-to-br from-primary to-sky-blue font-semibold text-white shadow-[var(--shadow-glow-blue)]"
      >
        <Save class="mr-1.5 h-4 w-4" />
        {saving ? m.settings_saving() : m.common_save()}
      </Button>
    </div>
  </div>

  <!-- Section 2: Branch Management -->
  <div class="rounded-xl border border-border bg-card p-5 shadow-card">
    <div class="mb-4 flex items-center gap-2">
      <Globe class="h-4 w-4 text-primary" />
      <h2 class="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
        {m.settings_branch_management()}
      </h2>
    </div>
    <ul class="space-y-2">
      {#each BRANCHES as branch (branch.name)}
        <li
          class="flex items-center justify-between rounded-xl border border-border bg-muted px-4 py-3"
        >
          <span class="text-sm font-semibold text-foreground">{branch.name}</span>
          <span class="text-xs font-medium text-muted-foreground">{branch.timezone}</span>
        </li>
      {/each}
    </ul>
  </div>

  <!-- Section 3: Point Categories -->
  <div class="rounded-xl border border-border bg-card p-5 shadow-card">
    <div class="mb-4 flex items-center gap-2">
      <Tag class="h-4 w-4 text-primary" />
      <h2 class="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
        {m.settings_point_categories()}
      </h2>
    </div>
    <ul class="space-y-2">
      {#each POINT_CATEGORIES as cat (cat.name)}
        <li
          class="flex items-center justify-between rounded-xl border border-border bg-muted px-4 py-3"
        >
          <span class="text-sm font-semibold text-foreground">{cat.name}</span>
          <span
            class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold {cat.active
              ? 'bg-status-approved-bg text-status-approved dark:bg-status-approved/20 dark:text-status-approved'
              : 'bg-muted text-muted-foreground'}"
          >
            {cat.active ? m.status_active() : m.status_inactive()}
          </span>
        </li>
      {/each}
    </ul>
  </div>
</div>
