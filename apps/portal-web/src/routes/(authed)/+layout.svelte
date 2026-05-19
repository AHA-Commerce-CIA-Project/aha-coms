<script lang="ts">
  import { onMount, setContext } from 'svelte'
  import { page } from '$app/stores'
  import { hasPortalRole } from '@coms-portal/shared'
  import { ServiceBar, Sidebar, MobileTopBar, MobileBottomNav, SlideOverNav } from '@coms-portal/ui-svelte/chrome'
  import { AccountWidget } from '@coms-portal/account-widget-svelte'
  import { Menu, User } from '@lucide/svelte'
  import { readHandoffIntent, popStashedIntent, navigateToLaunch } from '$lib/portal-handoff'
  import { BASE_NAV, ADMIN_NAV } from '$lib/nav'

  let { data, children } = $props()

  // SSR's `hooks.server.ts` already gated this route — if we render, `user` is
  // present. The `?? null` keeps the type honest without introducing a runtime
  // branch the loading skeleton used to handle.
  const user = $derived(data.user ?? null)
  const apps = $derived(data.dashboardApps ?? [])
  let sidebarCollapsed = $state(true)
  let menuOpen = $state(false)
  let theme = $state<'light' | 'dark'>('dark')

  setContext('user', () => user)

  // Onboarding pages (e.g. /onboarding/set-password) are blocking gates the
  // hooks.server.ts guard routes users to. They need to feel like a modal
  // step the user cannot navigate away from — so we suppress chrome
  // (sidebar, top bar, mobile nav) for the entire /onboarding/* subtree
  // while keeping the auth boundary intact.
  const isOnboarding = $derived($page.url.pathname.startsWith('/onboarding/'))

  // Service bar: portal first, then the registered apps the user can reach
  const services = $derived([
    { slug: 'portal', label: 'COMS' },
    ...apps.map((a) => ({
      slug: a.slug,
      label: a.name,
      formAction: `/api/auth/broker/launch/${a.slug}`,
    })),
  ])

  // super_admin is an internal portal role; collapse to 'admin' for hasPortalRole,
  // which is typed against the public PortalRole taxonomy ('employee' | 'admin').
  const isAdmin = $derived(
    user
      ? hasPortalRole(user.portalRole === 'super_admin' ? 'admin' : user.portalRole, ['admin'])
      : false,
  )

  const sidebarSections = $derived(
    isAdmin
      ? [{ items: BASE_NAV }, { label: 'Admin', items: ADMIN_NAV }]
      : [{ items: BASE_NAV }],
  )

  // MobileBottomNav: keep the user-visible items short; the full admin set
  // lives behind the hamburger that opens the SlideOverNav.
  const mobileNavItems = $derived(
    isAdmin
      ? [BASE_NAV[0], ADMIN_NAV[0], ADMIN_NAV[2]] // Dashboard, Employees, Apps
      : BASE_NAV,
  )

  // SlideOverNav: full nav surface for mobile admins so Teams, Aliases,
  // Taxonomies, Audit Log are reachable. T47 Finding 3 closed when this
  // pattern lifted into `@coms-portal/ui-svelte/chrome`.
  const slideOverNavItems = $derived(isAdmin ? [...BASE_NAV, ...ADMIN_NAV] : BASE_NAV)

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }

  // App switcher populated from SSR fetch of /api/userinfo — no static map needed.
  const widgetAppSwitcher = $derived(data.apps ?? [])

  // Same-origin portal post-logout target. The widget's sign-out helper hits
  // GET /api/auth/logout?post_logout_redirect_uri=… which the portal validates
  // against app_registry.url + the portal's own origin.
  const portalOrigin = $derived(
    typeof window !== 'undefined' ? window.location.origin : '',
  )

  onMount(async () => {
    // Restore theme preference
    const saved = localStorage.getItem('theme')
    if (saved === 'light') {
      document.documentElement.classList.remove('dark')
      theme = 'light'
    } else {
      document.documentElement.classList.add('dark')
      theme = 'dark'
    }

    // Intercept handoff intents
    const intent = readHandoffIntent($page.url) ?? popStashedIntent()
    if (intent) {
      navigateToLaunch(intent)
      return
    }
  })
</script>

{#if user && isOnboarding}
  {@render children()}
{:else if user}
  <div class="app-bg min-h-screen {sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}">
    <ServiceBar
      {services}
      currentApp="portal"
      {theme}
      onToggleTheme={toggleTheme}
    >
      {#snippet right()}
        <AccountWidget
          currentApp="portal"
          {portalOrigin}
          user={{
            name: user.name,
            email: user.email,
            portalRole: user.portalRole,
            apps: user.apps,
          }}
          appSwitcher={widgetAppSwitcher}
        />
      {/snippet}
    </ServiceBar>

    <MobileTopBar {theme} onToggleTheme={toggleTheme}>
      {#snippet leading()}
        {#if isAdmin}
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
      {#snippet brand()}
        <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary-dark to-primary shadow-md">
          <span class="text-[11px] font-extrabold text-white">C</span>
        </div>
        <span class="font-manrope text-[15px] font-extrabold tracking-wide text-white">COMS</span>
      {/snippet}
      {#snippet right()}
        <AccountWidget
          currentApp="portal"
          {portalOrigin}
          user={{
            name: user.name,
            email: user.email,
            portalRole: user.portalRole,
            apps: user.apps,
          }}
          appSwitcher={widgetAppSwitcher}
        />
      {/snippet}
    </MobileTopBar>

    <SlideOverNav
      bind:open={menuOpen}
      items={slideOverNavItems}
      currentPath={$page.url.pathname}
    >
      {#snippet brand()}
        <div class="flex items-center gap-2">
          <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary-dark to-primary shadow-md">
            <span class="text-[11px] font-extrabold text-white">C</span>
          </div>
          <span class="font-manrope text-[15px] font-extrabold tracking-wide text-foreground">COMS</span>
        </div>
      {/snippet}
      {#snippet footer()}
        <div class="flex items-center gap-3 rounded-lg px-3 py-2.5">
          <div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-primary/15">
            <User class="h-4 w-4" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-foreground">{user.name}</p>
            <span class="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
              {user.portalRole}
            </span>
          </div>
        </div>
      {/snippet}
    </SlideOverNav>

    <Sidebar
      sections={sidebarSections}
      currentPath={$page.url.pathname}
      collapsed={sidebarCollapsed}
      onCollapsedChange={(v) => (sidebarCollapsed = v)}
    >
      {#snippet logo({ collapsed })}
        <div class="flex items-center gap-2">
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-dark to-primary shadow-md">
            <span class="text-[13px] font-extrabold text-white">C</span>
          </div>
          {#if !collapsed}
            <span class="font-manrope text-[15px] font-extrabold tracking-wide text-foreground">COMS</span>
          {/if}
        </div>
      {/snippet}

    </Sidebar>

    <div class="pt-0 md:pt-9 md:ml-[var(--sidebar-width)] transition-[margin-left] duration-200">
      <main class="page-transition pt-14 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pt-6 md:pb-8 px-4 md:px-6 max-w-screen-xl mx-auto">
        {@render children()}
      </main>
    </div>

    <MobileBottomNav items={mobileNavItems} currentPath={$page.url.pathname} />
  </div>
{/if}
