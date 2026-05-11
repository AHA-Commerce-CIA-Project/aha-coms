<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * MobileTopBar — mobile chrome shared across COMS apps. Renamed from
   * Heroes' `TopBar.svelte` per spec-02 line 168 to disambiguate from the
   * desktop top bar (which is host-specific and not in chrome scope).
   *
   * Host-agnostic: brand mark, theme handler, and per-app controls
   * (search, notifications, hamburger menu) are passed in as snippets/props.
   * The `right` snippet is the account-widget mount point on mobile.
   */
  let {
    theme = 'light',
    onToggleTheme,
    brand,
    leading,
    trailing,
    right,
  }: {
    theme?: 'light' | 'dark'
    onToggleTheme?: () => void
    /** Brand mark + label (host-supplied — portal renders "C / COMS", Heroes renders "trophy / AHA HEROES"). */
    brand?: Snippet
    /** Leading slot before the brand — host mounts a hamburger button here when role-gating warrants. */
    leading?: Snippet
    /** Trailing slot after the theme toggle — host mounts search / notifications icons here. */
    trailing?: Snippet
    /** Right slot — account widget mount. */
    right?: Snippet
  } = $props()
</script>

<header
  class="fixed top-9 left-0 right-0 z-50 flex h-14 items-center justify-between px-4 md:hidden bg-[#0d1229]/85 backdrop-blur-xl border-b border-white/10"
>
  <div class="flex items-center gap-2">
    {#if leading}
      {@render leading()}
    {/if}
    {#if brand}
      {@render brand()}
    {/if}
  </div>

  <div class="flex items-center gap-1">
    {#if onToggleTheme}
      <button
        type="button"
        onclick={onToggleTheme}
        class="flex h-10 w-10 items-center justify-center rounded-full text-white/60 hover:bg-white/8 hover:text-white transition-colors"
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {#if theme === 'dark'}
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        {:else}
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        {/if}
      </button>
    {/if}

    {#if trailing}
      {@render trailing()}
    {/if}

    {#if right}
      {@render right()}
    {/if}
  </div>
</header>
