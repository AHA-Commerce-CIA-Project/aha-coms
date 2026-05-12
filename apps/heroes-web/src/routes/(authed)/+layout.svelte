<script lang="ts">
  import {
    ServiceBar,
    Sidebar,
    MobileTopBar,
    MobileBottomNav,
    deriveServiceBarServices,
  } from '@coms-portal/ui-svelte/chrome'
  import { Sheet, SheetContent } from '@coms-portal/ui-svelte/primitives'
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
  import Header from '$lib/components/layout/Header.svelte'
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

  function closeMenu() {
    menuOpen = false
  }

  // ── chrome data ──────────────────────────────────────────────────────────

  // Theme narrowing now lives in the chrome lib (Spec 02 Phase 4 / T41).
  // Heroes passes `uiState.theme` ('system' | 'light' | 'dark') straight
  // through; `ServiceBar` and `MobileTopBar` call `resolveTheme` internally
  // to pick the toggle icon. The DOM `dark` class continues to be resolved
  // via `prefers-color-scheme` by uiState's `applyDomClass` step.

  // Service bar derived in the chrome lib (Spec 02 Phase 4 / T40). The
  // catalog is the portal hub entry prepended to the rich `apps` array
  // userinfo returned; `deriveServiceBarServices` collapses each entry's
  // absolute URL to a same-origin path when it matches `currentOrigin`.
  const serviceBarServices = $derived(
    deriveServiceBarServices({
      catalog: [
        { slug: 'portal', label: 'COMS', url: `${$page.url.origin}/` },
        ...(data.appCatalog ?? []),
      ],
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
  // T40 has lifted the derivation out of heroes.
  const widgetAppSwitcher = $derived([...(data.appCatalog ?? [])])

  const widgetUser = $derived(data.user ? {
    name: data.user.name,
    email: data.user.email,
    portalRole: data.user.portalRole,
    apps: [...data.user.apps],
  } : null)

  // Active path helper for slide-over menu
  function isActive(href: string) {
    return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/')
  }
</script>

<div class="app-bg min-h-screen {uiState.sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}">
  <ServiceBar
    services={serviceBarServices}
    currentApp="heroes"
    theme={uiState.theme}
    onToggleTheme={() => uiState.setTheme(uiState.theme === 'dark' ? 'light' : 'dark')}
  >
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

  <div class="pt-9 md:ml-[var(--sidebar-width)] transition-[margin-left] duration-200">
    <Header unreadCount={data.unreadCount} onOpenPalette={() => (paletteOpen = true)} />
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

  Spec 02 Phase 4 / T43 decision: this stays heroes-local rather than
  graduating into the chrome lib as a `<SlideOverNav>` component. Rationale:
  heroes is the only Svelte app with admin-only mobile nav today (portal-
  web has no admin mobile surface; aha-fast is React-side and would
  consume `@coms-portal/ui-react`, not Svelte chrome). One concrete
  consumer is premature for an abstraction; when a second appears, lift
  the composition (brand header + nav list + user-info footer) into
  chrome then. The cross-app pattern that DID earn a place in the chrome
  corridor is the panel mechanics — backdrop, focus trap, ESC handling,
  side-anchored slide-in — and the suite already owned those at
  `packages/ui-svelte/src/primitives/sheet/` (bits-ui-backed). The
  hand-rolled `<div class="fixed inset-0…">` backdrop + `<svelte:window
  onkeydown>` ESC handler + manual close-button shim retired in this
  pass; the Sheet primitive carries the accessibility load.
-->
<Sheet bind:open={menuOpen}>
  <SheetContent side="left" class="md:hidden w-72 sm:max-w-sm p-0 bg-card flex flex-col gap-0">
    <!-- Panel header — heroes brand mark (Sheet ships its own close button at top-3 right-3) -->
    <div class="flex h-14 items-center border-b border-border px-4 shrink-0">
      <div class="flex items-center gap-2">
        <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-gold to-gold-light shadow-md">
          <Trophy class="h-3.5 w-3.5 text-gold-dark" />
        </div>
        <span class="font-manrope text-[15px] font-extrabold tracking-wide text-foreground">
          AHA HEROES
        </span>
      </div>
    </div>

    <!-- Panel nav -->
    <nav class="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
      {#each slideOverNavItems as item (item.href)}
        {@const active = isActive(item.href)}
        <a
          href={item.href}
          onclick={closeMenu}
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-primary/8 hover:text-foreground
            {active ? 'sidebar-link-active' : ''}"
        >
          <item.icon class="h-[18px] w-[18px] shrink-0" />
          <span class="leading-none">{item.label}</span>
        </a>
      {/each}
    </nav>

    <!-- Panel footer — widget owns sign-out; show user name + role for orientation -->
    <div class="border-t border-border p-2 shrink-0">
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
    </div>
  </SheetContent>
</Sheet>
