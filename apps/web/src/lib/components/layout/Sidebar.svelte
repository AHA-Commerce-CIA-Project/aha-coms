<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import { signOut } from 'firebase/auth'
  import { clientAuth } from '$lib/firebase'
  import { api } from '$lib/api'
  import {
    LayoutDashboard,
    Users,
    Building2,
    AppWindow,
    FileText,
    User,
    LogOut,
    Sun,
    Moon,
  } from 'lucide-svelte'
  import { hasPortalRole } from '@coms-portal/shared'
  import type { SessionUser } from '$lib/auth'

  let { user }: { user: SessionUser } = $props()

  let collapsed = $state(true)

  const isAdmin = $derived(hasPortalRole(user.portalRole, ['admin']))

  const NAV = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/profile', label: 'Profile', icon: User },
  ]

  const ADMIN_NAV = [
    { href: '/admin/employees', label: 'Employees', icon: Users },
    { href: '/admin/teams', label: 'Teams', icon: Building2 },
    { href: '/admin/apps', label: 'App Registry', icon: AppWindow },
    { href: '/admin/audit', label: 'Audit Log', icon: FileText },
  ]

  const initials = $derived(
    user.name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase(),
  )

  function isActive(href: string): boolean {
    if (href === '/') return $page.url.pathname === '/'
    return $page.url.pathname.startsWith(href)
  }

  function toggleTheme() {
    document.documentElement.classList.toggle('dark')
    localStorage.setItem(
      'theme',
      document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    )
  }

  async function handleSignOut() {
    await api.api.auth.logout.post({})
    await signOut(clientAuth)
    await goto('/login')
  }
</script>

<aside
  class="fixed top-9 left-0 z-40 hidden md:flex h-[calc(100vh-2.25rem)] flex-col transition-[width] duration-200 bg-card border-r border-border
    {collapsed ? 'w-16' : 'w-64'}"
  onmouseenter={() => (collapsed = false)}
  onmouseleave={() => (collapsed = true)}
  role="navigation"
  aria-label="Main navigation"
>
  <!-- Logo -->
  <div class="flex h-14 items-center border-b border-border {collapsed ? 'justify-center px-0' : 'px-4'}">
    <div class="flex items-center gap-2">
      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-dark to-primary shadow-md">
        <span class="text-[13px] font-extrabold text-white">C</span>
      </div>
      {#if !collapsed}
        <span class="font-manrope text-[15px] font-extrabold tracking-wide text-foreground">
          COMS
        </span>
      {/if}
    </div>
  </div>

  <!-- Navigation -->
  <nav class="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
    {#each NAV as item (item.href)}
      {@const active = isActive(item.href)}
      <a
        href={item.href}
        class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-primary/8 hover:text-foreground
          {collapsed ? 'justify-center px-0' : ''}
          {active ? 'sidebar-link-active' : ''}"
        title={collapsed ? item.label : undefined}
      >
        <item.icon class="h-[18px] w-[18px] shrink-0" />
        {#if !collapsed}
          <span class="leading-none">{item.label}</span>
        {/if}
      </a>
    {/each}

    {#if isAdmin}
      <div class="pt-4 pb-1.5 {collapsed ? 'px-1' : 'px-3'}">
        {#if !collapsed}
          <span class="section-label text-muted-foreground/50">Admin</span>
        {:else}
          <div class="border-t border-border"></div>
        {/if}
      </div>
      {#each ADMIN_NAV as item (item.href)}
        {@const active = isActive(item.href)}
        <a
          href={item.href}
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-primary/8 hover:text-foreground
            {collapsed ? 'justify-center px-0' : ''}
            {active ? 'sidebar-link-active' : ''}"
          title={collapsed ? item.label : undefined}
        >
          <item.icon class="h-[18px] w-[18px] shrink-0" />
          {#if !collapsed}
            <span class="leading-none">{item.label}</span>
          {/if}
        </a>
      {/each}
    {/if}
  </nav>

  <!-- Footer: theme + user -->
  <div class="border-t border-border p-2 space-y-0.5">
    <!-- Theme toggle -->
    <button
      type="button"
      onclick={toggleTheme}
      class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors
        {collapsed ? 'justify-center px-0' : ''}"
      title={collapsed ? 'Toggle theme' : undefined}
      aria-label="Toggle theme"
    >
      <Sun class="h-[18px] w-[18px] shrink-0 dark:hidden" />
      <Moon class="hidden h-[18px] w-[18px] shrink-0 dark:block" />
      {#if !collapsed}
        <span class="leading-none">Toggle theme</span>
      {/if}
    </button>

    <!-- Sign out -->
    <button
      type="button"
      onclick={handleSignOut}
      class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors
        {collapsed ? 'justify-center px-0' : ''}"
      title={collapsed ? 'Sign out' : undefined}
      aria-label="Sign out"
    >
      <LogOut class="h-[18px] w-[18px] shrink-0" />
      {#if !collapsed}
        <span class="leading-none">Sign out</span>
      {/if}
    </button>

    <!-- User info -->
    <a
      href="/profile"
      class="flex items-center gap-3 rounded-lg px-3 py-2.5 {collapsed ? 'justify-center px-0' : ''}"
    >
      <div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-primary/15">
        {initials}
      </div>
      {#if !collapsed}
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-foreground">{user.name}</p>
          <span class="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
            {user.portalRole}
          </span>
        </div>
      {/if}
    </a>
  </div>
</aside>
