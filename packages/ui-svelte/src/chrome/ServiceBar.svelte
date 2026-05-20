<script lang="ts">
  import type { Snippet } from 'svelte'
  import { resolveTheme, type ThemePreference } from './resolve-theme'

  /**
   * ServiceBar — top suite chrome shared across COMS apps.
   *
   * 2026-05-20 unification pass aligned this with `apps/fast`'s TopNav
   * layout: h-16 height, AHA COMS wordmark brand anchor on the left,
   * pill-shaped cross-app tabs (rounded-full with FAST's active/inactive
   * tokens), and an optional notification bell that sits before the
   * theme toggle so the right cluster reads [Bell] → [Theme] → [Avatar].
   *
   * 2026-05-20 flyout pass added optional sub-menu support per
   * ServiceItem.children — when the ACTIVE pill carries children, the
   * pill becomes a hover/click trigger and reveals a panel below
   * listing the child routes (mirrors fast's TopNav Tier-1 panel).
   * Inactive cross-app pills stay as plain navigation links even if
   * `children` is provided — the consuming app doesn't have authority
   * over another app's internal routes.
   *
   * Host-agnostic: hosts pass brand href + logo asset path (each app
   * serves the AHA logo from its own static/public folder), an optional
   * notifications href + unread count, theme state, and an `right`
   * snippet for the account widget. Lucide is not imported here per
   * spec-02 §Out of Scope — bell + theme + chevron glyphs are inline SVG.
   */
  interface ServiceChild {
    label: string
    href: string
  }

  interface ServiceItem {
    slug: string
    label: string
    /** Either a top-level URL (cross-origin) or a local form action ("/api/auth/broker/launch/<slug>"). */
    href?: string
    formAction?: string
    /** Sub-routes for an active app's pill. When present AND this is the active pill,
     *  the pill becomes a flyout trigger instead of a static label. Ignored for
     *  inactive pills. */
    children?: ServiceChild[]
  }

  let {
    services = [],
    currentApp,
    theme = 'light',
    onToggleTheme,
    brandHref,
    brandLogoSrc,
    notificationsHref,
    unreadCount = 0,
    right,
  }: {
    services?: ServiceItem[]
    /** Slug of the currently-rendered app. Matching service tab gets active styling. */
    currentApp: string
    /** Theme preference; `'system'` collapses internally to `'light'` for the toggle icon. */
    theme?: ThemePreference
    onToggleTheme?: () => void
    /** Home link target — clicking the AHA COMS wordmark/logo goes here. Typically the portal origin. */
    brandHref: string
    /** Path to the AHA logo PNG (served from each app's static/public folder). */
    brandLogoSrc: string
    /** When present, the notification bell renders before the theme toggle and links to this URL. */
    notificationsHref?: string
    /** Unread badge count; only rendered when `notificationsHref` is provided AND value > 0. */
    unreadCount?: number
    /** Right-slot snippet — host mounts the account widget here. */
    right?: Snippet
  } = $props()

  const resolvedTheme = $derived(resolveTheme(theme))
  const badgeDisplay = $derived(unreadCount > 99 ? '99+' : String(unreadCount))

  // Flyout state — null when closed, holds the open pill's slug when open.
  // Hover open / click toggle / mouse-leave close-with-grace so the cursor
  // can travel from pill to panel without the panel folding mid-traversal.
  let openFlyoutSlug = $state<string | null>(null)
  let closeTimer: ReturnType<typeof setTimeout> | null = null

  function openFlyout(slug: string) {
    if (closeTimer) {
      clearTimeout(closeTimer)
      closeTimer = null
    }
    openFlyoutSlug = slug
  }

  function scheduleFlyoutClose() {
    if (closeTimer) clearTimeout(closeTimer)
    closeTimer = setTimeout(() => {
      openFlyoutSlug = null
      closeTimer = null
    }, 200)
  }

  function toggleFlyout(slug: string) {
    if (closeTimer) {
      clearTimeout(closeTimer)
      closeTimer = null
    }
    openFlyoutSlug = openFlyoutSlug === slug ? null : slug
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') openFlyoutSlug = null
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div
  class="fixed top-0 left-0 right-0 z-[70] h-16 hidden md:flex items-center bg-[#0F0E7F] px-4 gap-1 shadow-md"
>
  <!-- Brand anchor — AHA logo + "AHA COMS" wordmark. Mirrors apps/fast
       TopNav.tsx:352-369 verbatim so the suite reads consistently
       regardless of which app you're inside. -->
  <a
    href={brandHref}
    aria-label="AHA COMS — return to portal"
    class="flex items-center gap-2.5 pr-4 sm:pr-5 shrink-0"
  >
    <div class="w-9 h-9 rounded-full bg-white flex items-center justify-center p-1">
      <img src={brandLogoSrc} alt="AHA" class="w-full h-full object-contain" />
    </div>
    <div class="hidden sm:flex items-baseline">
      <span class="text-xl font-extrabold text-white tracking-tight">AHA</span>
      <span class="text-xl font-medium text-white/90 ml-1 tracking-tight">COMS</span>
    </div>
  </a>

  <!-- Cross-app pills. Active pill = solid white with brand-navy text;
       inactive = white/5 resting fill with white/15 hover. When the
       active pill carries children, it becomes a hover/click trigger
       for a sub-menu flyout (see top of file). -->
  {#each services as svc (svc.slug)}
    {@const isActive = svc.slug === currentApp}
    {@const baseTokens = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wide whitespace-nowrap transition-colors'}
    {@const hasFlyout = isActive && !!svc.children && svc.children.length > 0}
    {#if isActive && hasFlyout}
      <div
        class="relative"
        onmouseenter={() => openFlyout(svc.slug)}
        onmouseleave={scheduleFlyoutClose}
        role="presentation"
      >
        <button
          type="button"
          onclick={() => toggleFlyout(svc.slug)}
          aria-haspopup="menu"
          aria-expanded={openFlyoutSlug === svc.slug}
          aria-current="page"
          class="{baseTokens} bg-white text-[#0F0E7F] shadow-sm select-none"
        >
          {svc.label}
          <svg class="h-3.5 w-3.5 transition-transform" style:transform={openFlyoutSlug === svc.slug ? 'rotate(180deg)' : 'rotate(0deg)'} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {#if openFlyoutSlug === svc.slug}
          <div
            role="menu"
            tabindex="-1"
            onmouseenter={() => openFlyout(svc.slug)}
            onmouseleave={scheduleFlyoutClose}
            class="absolute top-full left-0 mt-1 min-w-[220px] bg-card border border-border rounded-xl shadow-xl py-1 z-[80]"
          >
            {#each svc.children ?? [] as child (child.href)}
              <a
                href={child.href}
                role="menuitem"
                onclick={() => { openFlyoutSlug = null }}
                class="block px-4 py-2 text-sm font-medium text-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                {child.label}
              </a>
            {/each}
          </div>
        {/if}
      </div>
    {:else if isActive}
      <div
        class="{baseTokens} bg-white text-[#0F0E7F] shadow-sm cursor-default select-none"
        aria-current="page"
      >
        {svc.label}
      </div>
    {:else if svc.formAction}
      <form method="POST" action={svc.formAction} class="contents">
        <button
          type="submit"
          class="{baseTokens} text-white/80 bg-white/5 hover:text-white hover:bg-white/15 tap-active"
        >
          {svc.label}
        </button>
      </form>
    {:else}
      <a
        href={svc.href}
        class="{baseTokens} text-white/80 bg-white/5 hover:text-white hover:bg-white/15"
      >
        {svc.label}
      </a>
    {/if}
  {/each}

  <div class="flex-1"></div>

  <!-- Notification bell (opt-in). Renders ahead of the theme toggle so
       the right cluster reads [Bell] → [Theme] → [Avatar], matching
       fast's TopNav. Apps that don't have a notifications surface
       (e.g. portal-web) omit `notificationsHref` and the bell hides. -->
  {#if notificationsHref}
    <a
      href={notificationsHref}
      class="relative flex h-9 w-9 items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
      aria-label="Notifications"
    >
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {#if unreadCount > 0}
        <span class="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-none">
          {badgeDisplay}
        </span>
      {/if}
    </a>
  {/if}

  {#if onToggleTheme}
    <button
      type="button"
      onclick={onToggleTheme}
      class="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
      aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {#if resolvedTheme === 'dark'}
        <!-- Sun glyph -->
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      {:else}
        <!-- Moon glyph -->
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      {/if}
    </button>
  {/if}

  {#if right}
    {@render right()}
  {/if}
</div>
