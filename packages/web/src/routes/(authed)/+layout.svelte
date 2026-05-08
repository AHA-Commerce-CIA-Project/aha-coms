<script lang="ts">
  import { ServiceBar, Sidebar, MobileTopBar, MobileBottomNav } from '@coms-portal/ui/chrome'
  import { AccountWidget } from '@coms-portal/account-widget'
  import { APP_LAUNCHER } from '@coms-portal/sdk/constants/app-launcher'
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
    X,
    User,
  } from 'lucide-svelte'
  import { page } from '$app/stores'
  import * as m from '$lib/paraglide/messages'
  import Header from '$lib/components/layout/Header.svelte'
  import PullToRefresh from '$lib/components/PullToRefresh.svelte'
  import CommandPalette from '$lib/components/CommandPalette.svelte'
  import { uiState } from '$lib/state/uiState.svelte'
  import { userState } from '$lib/state/userState.svelte'

  let { data, children } = $props()
  // data contains { user, avatarUrl, unreadCount, portalOrigin }

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

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeMenu()
  }

  // ── chrome data ──────────────────────────────────────────────────────────

  // Narrow uiState.theme ('system' | 'light' | 'dark') to what chrome components accept ('light' | 'dark').
  // 'system' is treated as 'light' until JS resolves the media query (applyDomClass handles the DOM class).
  const effectiveTheme = $derived(
    uiState.theme === 'system' ? 'light' : uiState.theme,
  ) satisfies 'light' | 'dark'

  const serviceBarServices = $derived([
    { slug: 'portal', label: 'COMS', href: data.portalOrigin },
    { slug: 'heroes', label: 'Heroes' }, // current — no link
  ])

  const isAdminOrHr = $derived(
    userState.isAdmin || userState.current?.role === 'hr',
  )

  // Nav item arrays — icons cast to satisfy chrome's Component type signature.
  // Lucide exports are compatible at runtime; the type gap is a version-skew artefact.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyIcon = any

  const mainNavItems = [
    { href: '/dashboard', label: m.nav_dashboard() as string, icon: LayoutDashboard as AnyIcon },
    { href: '/points', label: m.nav_points() as string, icon: Award as AnyIcon },
    { href: '/leaderboard', label: m.nav_leaderboard() as string, icon: Trophy as AnyIcon },
    { href: '/rewards', label: m.nav_rewards() as string, icon: Gift as AnyIcon },
    { href: '/redemptions', label: m.nav_redemptions() as string, icon: ShoppingCart as AnyIcon },
  ]

  const adminNavItems = [
    { href: '/admin/users', label: m.nav_users() as string, icon: Users as AnyIcon },
    { href: '/teams', label: m.nav_teams() as string, icon: Building2 as AnyIcon },
    { href: '/reports', label: m.nav_reports() as string, icon: BarChart3 as AnyIcon },
    { href: '/admin/audit-log', label: m.nav_audit_log() as string, icon: FileText as AnyIcon },
    { href: '/admin/sheet-sync', label: m.nav_sheet_sync() as string, icon: RefreshCw as AnyIcon },
    { href: '/admin/settings', label: m.nav_settings() as string, icon: Settings as AnyIcon },
  ]

  // Slide-over admin menu items (all items, for mobile full-nav panel)
  const slideOverNavItems = [
    { href: '/dashboard', label: m.nav_dashboard() as string, icon: LayoutDashboard as AnyIcon },
    { href: '/points', label: m.nav_points() as string, icon: Award as AnyIcon },
    { href: '/rewards', label: m.nav_rewards() as string, icon: Gift as AnyIcon },
    { href: '/redemptions', label: m.nav_redemptions() as string, icon: ShoppingCart as AnyIcon },
    { href: '/admin/users', label: m.nav_users() as string, icon: Users as AnyIcon },
    { href: '/teams', label: m.nav_teams() as string, icon: Building2 as AnyIcon },
    { href: '/reports', label: m.nav_reports() as string, icon: BarChart3 as AnyIcon },
    { href: '/admin/audit-log', label: m.nav_audit_log() as string, icon: FileText as AnyIcon },
    { href: '/admin/sheet-sync', label: m.nav_sheet_sync() as string, icon: RefreshCw as AnyIcon },
    { href: '/admin/settings', label: m.nav_settings() as string, icon: Settings as AnyIcon },
  ]

  const sidebarSections = $derived([
    { items: mainNavItems },
    ...(isAdminOrHr ? [{ label: m.nav_admin() as string, items: adminNavItems }] : []),
  ])

  // ── widget data ───────────────────────────────────────────────────────────

  const widgetAppSwitcher = $derived(
    (data.user?.apps ?? [])
      .map((slug: string) => {
        const entry = APP_LAUNCHER[slug]
        return entry ? { slug, label: entry.label, url: entry.url } : null
      })
      .filter((e: { slug: string; label: string; url: string } | null) => e !== null),
  )

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

<svelte:window onkeydown={handleKeydown} />

<div class="app-bg min-h-screen {uiState.sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}">
  <ServiceBar
    services={serviceBarServices}
    currentApp="heroes"
    theme={effectiveTheme}
    onToggleTheme={() => uiState.setTheme(uiState.theme === 'dark' ? 'light' : 'dark')}
  >
    {#snippet right()}
      {#if widgetUser}
        <AccountWidget
          currentApp="heroes"
          portalOrigin={data.portalOrigin}
          user={widgetUser}
          appSwitcher={widgetAppSwitcher}
          postLogoutRedirectUri={`${data.heroesOrigin.replace(/\/$/, '')}/logged-out`}
        />
      {/if}
    {/snippet}
  </ServiceBar>

  <MobileTopBar
    theme={effectiveTheme}
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
        href="/notifications"
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
          portalOrigin={data.portalOrigin}
          user={widgetUser}
          appSwitcher={widgetAppSwitcher}
          postLogoutRedirectUri={`${data.heroesOrigin.replace(/\/$/, '')}/logged-out`}
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
      { href: '/dashboard', label: m.nav_dashboard() as string, icon: LayoutDashboard as AnyIcon },
      { href: '/points', label: m.nav_points() as string, icon: Award as AnyIcon },
      { href: '/leaderboard', label: m.nav_leaderboard() as string, icon: Trophy as AnyIcon },
      { href: '/rewards', label: m.nav_rewards() as string, icon: Gift as AnyIcon },
    ]}
    currentPath={$page.url.pathname}
  />

  <CommandPalette bind:open={paletteOpen} role={data.user?.role} />
</div>

<!-- Slide-over admin menu — admin/HR only, mobile only -->
{#if isAdminOrHr && menuOpen}
  <!-- Backdrop -->
  <button
    type="button"
    class="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm md:hidden"
    onclick={closeMenu}
    aria-label="Close menu"
  ></button>

  <!-- Panel -->
  <div class="fixed inset-y-0 left-0 z-[70] w-72 bg-card shadow-2xl md:hidden animate-slide-in-left flex flex-col">
    <!-- Panel header -->
    <div class="flex h-14 items-center justify-between border-b border-border px-4 shrink-0">
      <div class="flex items-center gap-2">
        <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-gold to-gold-light shadow-md">
          <Trophy class="h-3.5 w-3.5 text-gold-dark" />
        </div>
        <span class="font-manrope text-[15px] font-extrabold tracking-wide text-foreground">
          AHA HEROES
        </span>
      </div>
      <button
        type="button"
        onclick={closeMenu}
        class="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/8 hover:text-foreground transition-colors"
        aria-label="Close menu"
      >
        <X class="h-5 w-5" />
      </button>
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
  </div>
{/if}
