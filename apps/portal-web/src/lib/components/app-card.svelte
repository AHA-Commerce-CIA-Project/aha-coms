<script lang="ts">
  import type { Component } from 'svelte'
  import { Button } from '@coms-portal/ui-svelte/primitives'
  import { Zap, Award, AppWindow } from '@lucide/svelte'

  let { app, redirectTo }: {
    app: { id: string; slug: string; name: string; description: string | null; url: string; iconUrl: string | null; status: string; healthStatus?: string }
    redirectTo?: string
  } = $props()

  const launchAction = $derived(
    redirectTo
      ? `/api/auth/broker/launch/${app.slug}?redirectTo=${encodeURIComponent(redirectTo)}`
      : `/api/auth/broker/launch/${app.slug}`,
  )

  // Per-slug presentational overrides for the canonical suite apps. The
  // backend dashboardQuery returns app rows with short slugs + names; the
  // dashboard landing wants premium, expanded presentation (acronym
  // expansion in the title + a curated lucide glyph instead of the raw
  // iconUrl). Falls through to data-driven rendering for any other app.
  interface CardOverride {
    icon: Component
    iconBg: string
    iconColor: string
    title: string
    subtitle: string
  }
  const OVERRIDES: Record<string, CardOverride> = {
    fast: {
      icon: Zap,
      iconBg: 'bg-gradient-to-br from-indigo-500/15 to-indigo-600/20 group-hover:from-indigo-500/25 group-hover:to-indigo-600/30',
      iconColor: 'text-indigo-500',
      title: 'FAST (FBI Assignment Smart Tracker)',
      subtitle: 'AI-assisted task tracking and assignment for the field operations bench.',
    },
    heroes: {
      icon: Award,
      iconBg: 'bg-gradient-to-br from-amber-400/15 to-amber-500/20 group-hover:from-amber-400/25 group-hover:to-amber-500/30',
      iconColor: 'text-amber-500',
      title: 'HEROES (Employee Star & Penalty Points Ledger)',
      subtitle: 'Audit employee recognition stars and performance penalty points across teams.',
    },
  }
  const override = $derived(OVERRIDES[app.slug])
  const initial = $derived(app.name.charAt(0).toUpperCase())
</script>

<form method="POST" action={launchAction}>
  <Button
    type="submit"
    variant="ghost"
    class="group flex w-full flex-col items-start gap-3 rounded-2xl card-surface card-hover p-5 transition-all tap-active text-left h-auto"
  >
    {#if override}
      {@const Icon = override.icon}
      <div class="flex h-12 w-12 items-center justify-center rounded-xl {override.iconBg} transition-colors">
        <Icon class="h-6 w-6 {override.iconColor}" />
      </div>
      <div class="text-left">
        <p class="text-base font-bold text-foreground leading-tight">{override.title}</p>
        <p class="mt-1.5 text-xs text-muted-foreground line-clamp-2">{override.subtitle}</p>
        {#if app.healthStatus === 'unhealthy'}
          <div class="mt-2 flex items-center gap-1 text-xs text-red-500">
            <span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>
            Unavailable
          </div>
        {:else if app.healthStatus === 'degraded'}
          <div class="mt-2 flex items-center gap-1 text-xs text-yellow-500">
            <span class="h-1.5 w-1.5 rounded-full bg-yellow-500"></span>
            Degraded
          </div>
        {/if}
      </div>
    {:else}
      <!-- Fallback for non-canonical apps — keeps the existing
           data-driven look so the override only enhances the two
           branded modules that the design system has curated copy for. -->
      <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/15 transition-colors">
        {#if app.iconUrl}
          <img src={app.iconUrl} alt={app.name} class="h-6 w-6 object-contain" />
        {:else}
          <AppWindow class="h-6 w-6 text-primary" />
          <span class="sr-only">{initial}</span>
        {/if}
      </div>
      <div class="text-left">
        <p class="text-base font-bold text-foreground leading-tight">{app.name}</p>
        {#if app.description}
          <p class="mt-1.5 text-xs text-muted-foreground line-clamp-2">{app.description}</p>
        {/if}
        {#if app.healthStatus === 'unhealthy'}
          <div class="mt-2 flex items-center gap-1 text-xs text-red-500">
            <span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>
            Unavailable
          </div>
        {:else if app.healthStatus === 'degraded'}
          <div class="mt-2 flex items-center gap-1 text-xs text-yellow-500">
            <span class="h-1.5 w-1.5 rounded-full bg-yellow-500"></span>
            Degraded
          </div>
        {:else if app.healthStatus === 'unknown'}
          <div class="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <span class="h-1.5 w-1.5 rounded-full bg-muted-foreground"></span>
            Status unknown
          </div>
        {/if}
      </div>
    {/if}
  </Button>
</form>
