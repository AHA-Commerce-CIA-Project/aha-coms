<script lang="ts">
  import {
    ServiceBar,
    Sidebar,
    MobileTopBar,
    MobileBottomNav,
    SlideOverNav,
    deriveServiceBarServices,
  } from '@coms-portal/ui-svelte/chrome'
  import { AccountWidget } from '@coms-portal/account-widget-svelte'
  import {
    Trophy,
    LayoutDashboard,
    Award,
    Gift,
    ShoppingCart,
    Users,
    Building2,
    BarChart3,
    FileText,
    RefreshCw,
    Settings,
    Bell,
    Search,
    Menu,
    User,
  } from '@lucide/svelte'
  import { page } from '$app/stores'
  import { base } from '$app/paths'
  import * as m from '$lib/paraglide/messages'
  import PullToRefresh from '$lib/components/PullToRefresh.svelte'
  import CommandPalette from '$lib/components/CommandPalette.svelte'
  import { uiState } from '$lib/state/uiState.svelte'
  import { userState } from '$lib/state/userState.svelte'

  let { data, children } = $props()
  // data contains { user, avatarUrl, unreadCount }

  let paletteOpen = $state(false)
  let menuOpen = $state(false)

  $effect(() => {
    userState.init(data.user)
  })

  $effect(() => {
    uiState.initEffects()
  })

  $effect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        paletteOpen = !paletteOpen
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  // ── chrome data ──────────────────────────────────────────────────────────

  // Theme narrowing now lives in the chrome lib (Spec 02 Phase 4 / T41).
  // Heroes passes `uiState.theme` ('system' | 'light' | 'dark') straight
  // through; `ServiceBar` and `MobileTopBar` call `resolveTheme` internally
  // to pick the toggle icon. The DOM `dark` class continues to be resolved
  // via `prefers-color-scheme` by uiState's `applyDomClass` step.

  // Service bar derived in the chrome lib (Spec 02 Phase 4 / T40). The
  // catalog comes straight from `data.appCatalog` now that portal-api's
  // /api/userinfo includes the COMS hub entry as a synthetic first item
  // (T47 follow-up to Findings 2 + 3). `deriveServiceBarServices` collapses
  // each entry's URL to a same-origin path when it matches `currentOrigin`.
  const serviceBarServices = $derived(
    deriveServiceBarServices({
      catalog: data.appCatalog ?? [],
      currentApp: 'heroes',
      currentOrigin: $page.url.origin,
    }),
  )

  const isAdminOrHr = $derived(
    userState.isAdmin || userState.current?.role === 'hr',
  )

  const mainNavItems = [
    { href: `${base}/dashboard`, label: m.nav_dashboard() as string, icon: LayoutDashboard },
    { href: `${base}/points`, label: m.nav_points() as string, icon: Award },
    { href: `${base}/leaderboard`, label: m.nav_leaderboard() as string, icon: Trophy },
    { href: `${base}/rewards`, label: m.nav_rewards() as string, icon: Gift },
    { href: `${base}/redemptions`, label: m.nav_redemptions() as string, icon: ShoppingCart },
  ]

  const adminNavItems = [
    { href: `${base}/admin/users`, label: m.nav_users() as string, icon: Users },
    { href: `${base}/teams`, label: m.nav_teams() as string, icon: Building2 },
    { href: `${base}/admin/reports`, label: m.nav_reports() as string, icon: BarChart3 },
    { href: `${base}/admin/audit-log`, label: m.nav_audit_log() as string, icon: FileText },
    { href: `${base}/admin/sheet-sync`, label: m.nav_sheet_sync() as string, icon: RefreshCw },
    { href: `${base}/admin/settings`, label: m.nav_settings() as string, icon: Settings },
  ]

  // Slide-over admin menu items (all items, for mobile full-nav panel)
  const slideOverNavItems = [
    { href: `${base}/dashboard`, label: m.nav_dashboard() as string, icon: LayoutDashboard },
    { href: `${base}/points`, label: m.nav_points() as string, icon: Award },
    { href: `${base}/rewards`, label: m.nav_rewards() as string, icon: Gift },
    { href: `${base}/redemptions`, label: m.nav_redemptions() as string, icon: ShoppingCart },
    { href: `${base}/admin/users`, label: m.nav_users() as string, icon: Users },
    { href: `${base}/teams`, label: m.nav_teams() as string, icon: Building2 },
    { href: `${base}/admin/reports`, label: m.nav_reports() as string, icon: BarChart3 },
    { href: `${base}/admin/audit-log`, label: m.nav_audit_log() as string, icon: FileText },
    { href: `${base}/admin/sheet-sync`, label: m.nav_sheet_sync() as string, icon: RefreshCw },
    { href: `${base}/admin/settings`, label: m.nav_settings() as string, icon: Settings },
  ]

  const sidebarSections = $derived([
    { items: mainNavItems },
    ...(isAdminOrHr ? [{ label: m.nav_admin() as string, items: adminNavItems }] : []),
  ])

  // ── widget data ───────────────────────────────────────────────────────────

  // The AccountWidget's launcher list is exactly the rich `apps` array
  // userinfo returned — no slug→label/url mapping needed app-side now that
  // T40 has lifted the derivation out of heroes, and no portal-hub prepend
  // needed app-side now that portal-api's /api/userinfo includes the COMS
  // entry directly (T47 follow-up to Findings 2 + 3).
  const widgetAppSwitcher = $derived([...(data.appCatalog ?? [])])

  const widgetUser = $derived(data.user ? {
    name: data.user.name,
    email: data.user.email,
    portalRole: data.user.portalRole,
    apps: [...data.user.apps],
  } : null)
</script>

<div class="app-bg min-h-screen {uiState.sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}">
  <ServiceBar
    services={serviceBarServices}
    currentApp="heroes"
    theme={uiState.theme}
    onToggleTheme={() => uiState.setTheme(uiState.theme === 'dark' ? 'light' : 'dark')}
  >
    {#snippet right()}
      <!-- Notification bell — moved up from the secondary Header on
           2026-05-20 chrome consolidation so the navy ServiceBar is the
           single top bar on desktop, matching apps/fast's one-bar layout.
           Style mirrors MobileTopBar's bell (white-on-navy) for visual
           coherence across the suite; badge keeps Heroes' gold accent
           rather than fast's rose so the brand identity stays intact. -->
      <a
        href="{base}/notifications"
        class="relative flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:bg-white/8 hover:text-white transition-colors"
        aria-label={m.nav_notifications()}
      >
        <Bell class="h-[18px] w-[18px]" />
        {#if data.unreadCount > 0}
          <span class="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[9px] leading-none font-bold text-gold-dark">
            {data.unreadCount > 99 ? '99+' : data.unreadCount}
          </span>
        {/if}
      </a>
      {#if widgetUser}
        <AccountWidget
          currentApp="heroes"
          portalOrigin=""
          user={widgetUser}
          appSwitcher={widgetAppSwitcher}
          postLogoutRedirectUri={`${$page.url.origin}${base}/logged-out`}
        />
      {/if}
    {/snippet}
  </ServiceBar>

  <MobileTopBar
    theme={uiState.theme}
    onToggleTheme={() => uiState.setTheme(uiState.theme === 'dark' ? 'light' : 'dark')}
  >
    {#snippet brand()}
      <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-gold to-gold-light shadow-md">
        <Trophy class="h-3.5 w-3.5 text-gold-dark" />
      </div>
      <span class="font-manrope text-[15px] font-extrabold tracking-wide text-white">AHA HEROES</span>
    {/snippet}
    {#snippet leading()}
      {#if isAdminOrHr}
        <button
          type="button"
          onclick={() => (menuOpen = true)}
          class="flex h-10 w-10 items-center justify-center rounded-full text-white/60 hover:bg-white/8 hover:text-white transition-colors -ml-1"
          aria-label="Menu"
          aria-expanded={menuOpen}
        >
          <Menu class="h-5 w-5" />
        </button>
      {/if}
    {/snippet}
    {#snippet trailing()}
      <!-- Search / Command palette -->
      <button
        type="button"
        onclick={() => (paletteOpen = true)}
        class="flex h-10 w-10 items-center justify-center rounded-full text-white/60 hover:bg-white/8 hover:text-white transition-colors"
        aria-label="Search"
      >
        <Search class="h-5 w-5" />
      </button>

      <!-- Notifications -->
      <a
        href="{base}/notifications"
        class="relative flex h-10 w-10 items-center justify-center rounded-full text-white/60 hover:bg-white/8 hover:text-white transition-colors"
        aria-label={m.nav_notifications()}
      >
        <Bell class="h-5 w-5" />
        {#if data.unreadCount > 0}
          <span class="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[9px] font-bold leading-none text-gold-dark">
            {data.unreadCount > 99 ? '99+' : data.unreadCount}
          </span>
        {/if}
      </a>
    {/snippet}
    {#snippet right()}
      {#if widgetUser}
        <AccountWidget
          currentApp="heroes"
          portalOrigin=""
          user={widgetUser}
          appSwitcher={widgetAppSwitcher}
          postLogoutRedirectUri={`${$page.url.origin}${base}/logged-out`}
        />
      {/if}
    {/snippet}
  </MobileTopBar>

  <Sidebar
    sections={sidebarSections}
    currentPath={$page.url.pathname}
    collapsed={uiState.sidebarCollapsed}
    onCollapsedChange={(next) => uiState.setSidebarCollapsed(next)}
  >
    {#snippet logo({ collapsed })}
      <div class="flex items-center gap-2">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-gold to-gold-light shadow-md">
          <Trophy class="h-4 w-4 text-gold-dark" />
        </div>
        {#if !collapsed}
          <span class="font-manrope text-[15px] font-extrabold tracking-wide text-foreground">AHA HEROES</span>
        {/if}
      </div>
    {/snippet}
    <!-- footer snippet intentionally omitted: widget owns avatar/sign-out -->
  </Sidebar>

  <div class="pt-0 md:pt-9 md:ml-[var(--sidebar-width)] transition-[margin-left] duration-200">
    <!-- Desktop secondary Header was retired here on 2026-05-20 — its
         notification badge moved into the ServiceBar above (its `right`
         snippet), its LanguageSwitcher stays reachable from /profile,
         and its ⌘K command-palette button is gone but the keyboard
         shortcut (Cmd/Ctrl+K) remains bound at the layout level. -->
    <PullToRefresh>
      <main class="page-transition pt-14 pb-24 md:pt-0 md:pb-8 px-4 md:px-6 max-w-5xl mx-auto">
        {@render children()}
      </main>
    </PullToRefresh>
  </div>

  <MobileBottomNav
    items={[
      { href: `${base}/dashboard`, label: m.nav_dashboard() as string, icon: LayoutDashboard },
      { href: `${base}/points`, label: m.nav_points() as string, icon: Award },
      { href: `${base}/leaderboard`, label: m.nav_leaderboard() as string, icon: Trophy },
      { href: `${base}/rewards`, label: m.nav_rewards() as string, icon: Gift },
    ]}
    currentPath={$page.url.pathname}
  />

  <CommandPalette bind:open={paletteOpen} role={data.user?.role} />
</div>

<!--
  Slide-over admin menu — admin/HR only, mobile only.

  Lifted into `@coms-portal/ui-svelte/chrome` as `SlideOverNav` once
  portal-web grew the same need (T47 Finding 3); T43's "one consumer,
  don't lift" call retired with the second consumer. Heroes supplies
  the brand mark and the user-identity footer as snippets; the chrome
  component carries the Sheet wrapping, item iteration, active state,
  and close-on-click behaviour.
-->
<SlideOverNav
  bind:open={menuOpen}
  items={slideOverNavItems}
  currentPath={$page.url.pathname}
>
  {#snippet brand()}
    <div class="flex items-center gap-2">
      <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-gold to-gold-light shadow-md">
        <Trophy class="h-3.5 w-3.5 text-gold-dark" />
      </div>
      <span class="font-manrope text-[15px] font-extrabold tracking-wide text-foreground">
        AHA HEROES
      </span>
    </div>
  {/snippet}
  {#snippet footer()}
    <div class="flex items-center gap-3 rounded-lg px-3 py-2.5">
      <div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-primary/15">
        <User class="h-4 w-4" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold text-foreground">{data.user?.name ?? ''}</p>
        <span class="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
          {data.user?.role ?? ''}
        </span>
      </div>
    </div>
  {/snippet}
</SlideOverNav>
