<script lang="ts">
  import { onMount, setContext } from 'svelte'
  import { page } from '$app/stores'
  import { api } from '$lib/api'
  import { hasPortalRole } from '@coms-portal/shared'
  import { ServiceBar, Sidebar, MobileTopBar, MobileBottomNav } from '@coms-portal/ui-svelte/chrome'
  import { AccountWidget } from '@coms-portal/account-widget-svelte'
  import { readHandoffIntent, popStashedIntent, navigateToLaunch } from '$lib/portal-handoff'
  import { BASE_NAV, ADMIN_NAV } from '$lib/nav'

  let { data, children } = $props()

  // SSR's `hooks.server.ts` already gated this route — if we render, `user` is
  // present. The `?? null` keeps the type honest without introducing a runtime
  // branch the loading skeleton used to handle.
  const user = $derived(data.user ?? null)
  let apps = $state<{ slug: string; name: string }[]>([])
  let sidebarCollapsed = $state(true)
  let theme = $state<'light' | 'dark'>('dark')

  setContext('user', () => user)

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

  // MobileBottomNav: keep the user-visible items short; admin tools live behind
  // the desktop sidebar, not the mobile bottom strip.
  const mobileNavItems = $derived(
    isAdmin
      ? [BASE_NAV[0], ADMIN_NAV[0], ADMIN_NAV[2]] // Dashboard, Employees, Apps
      : BASE_NAV,
  )

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

    // Load apps for ServiceBar (best-effort — bar renders empty if this fails)
    const { data: appsData } = await api.api.v1.dashboard.get()
    if (appsData) apps = appsData

    // Intercept handoff intents
    const intent = readHandoffIntent($page.url) ?? popStashedIntent()
    if (intent) {
      navigateToLaunch(intent)
      return
    }
  })
</script>

{#if user}
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
