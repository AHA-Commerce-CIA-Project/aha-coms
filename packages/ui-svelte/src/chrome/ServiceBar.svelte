<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * ServiceBar — top suite chrome shared across COMS apps.
   *
   * Host-agnostic: receives services + theme + an optional `right` snippet
   * (the account-widget mount point) as props. The host owns data + state.
   * Tokens come from `@coms-portal/design-tokens` via Tailwind utility classes.
   */
  interface ServiceItem {
    slug: string
    label: string
    /** Either a top-level URL (cross-origin) or a local form action ("/api/auth/broker/launch/<slug>"). */
    href?: string
    formAction?: string
  }

  let {
    services = [],
    currentApp,
    theme = 'light',
    onToggleTheme,
    right,
  }: {
    services?: ServiceItem[]
    /** Slug of the currently-rendered app. Matching service tab gets active styling. */
    currentApp: string
    theme?: 'light' | 'dark'
    onToggleTheme?: () => void
    /** Right-slot snippet — host mounts the account widget here. */
    right?: Snippet
  } = $props()

  // Lucide is consumed directly by each app per spec-02 §Out of Scope.
  // The host can compose icons inside the right snippet; the bar itself only
  // ships the theme toggle, which uses the inline glyphs below.
</script>

<div
  class="fixed top-0 left-0 right-0 z-[70] h-9 flex items-center bg-gradient-to-r from-deep-navy to-primary-dark border-b border-white/8 px-3 gap-1"
>
  {#each services as svc (svc.slug)}
    {@const isActive = svc.slug === currentApp}
    {#if isActive}
      <div
        class="flex h-6 items-center px-2.5 rounded text-[11px] font-semibold bg-white/10 text-white cursor-default select-none"
      >
        {svc.label}
      </div>
    {:else if svc.formAction}
      <form method="POST" action={svc.formAction} class="contents">
        <button
          type="submit"
          class="flex h-6 items-center px-2.5 rounded text-[11px] font-semibold text-white/45 hover:text-white/80 hover:bg-white/6 transition-colors tap-active"
        >
          {svc.label}
        </button>
      </form>
    {:else}
      <a
        href={svc.href}
        class="flex h-6 items-center px-2.5 rounded text-[11px] font-semibold text-white/45 hover:text-white/80 hover:bg-white/6 transition-colors"
      >
        {svc.label}
      </a>
    {/if}
  {/each}

  <div class="flex-1"></div>

  {#if onToggleTheme}
    <button
      type="button"
      onclick={onToggleTheme}
      class="flex h-[26px] w-[26px] items-center justify-center rounded-md text-primary-light/60 hover:text-primary-light hover:bg-white/6 transition-colors"
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {#if theme === 'dark'}
        <!-- Sun glyph -->
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      {:else}
        <!-- Moon glyph -->
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      {/if}
    </button>
  {/if}

  {#if right}
    {@render right()}
  {/if}
</div>
