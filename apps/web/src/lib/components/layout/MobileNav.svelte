<script lang="ts">
  import { page } from '$app/stores'
  import { LayoutDashboard, Users, Building2, AppWindow, User } from 'lucide-svelte'
  import { hasPortalRole } from '@coms-portal/shared'
  import type { SessionUser } from '$lib/auth'

  let { user }: { user: SessionUser } = $props()

  const isAdmin = $derived(hasPortalRole(user.portalRole, ['admin']))

  const baseItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/profile', label: 'Profile', icon: User },
  ]

  const adminItems = [
    { href: '/admin/employees', label: 'Employees', icon: Users },
    { href: '/admin/teams', label: 'Teams', icon: Building2 },
    { href: '/admin/apps', label: 'Apps', icon: AppWindow },
  ]

  const navItems = $derived(
    isAdmin
      ? [baseItems[0], ...adminItems, baseItems[1]]
      : baseItems,
  )

  function isActive(href: string): boolean {
    if (href === '/') return $page.url.pathname === '/'
    return $page.url.pathname.startsWith(href)
  }
</script>

<nav
  class="fixed bottom-0 left-0 right-0 z-50 flex items-stretch md:hidden
    bg-[#0d1229]/85 backdrop-blur-xl border-t border-white/10
    h-[calc(4rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)]"
  aria-label="Mobile navigation"
>
  {#each navItems as item (item.href)}
    {@const active = isActive(item.href)}
    <a
      href={item.href}
      class="relative flex flex-1 flex-col items-center justify-center gap-1 min-h-[44px] transition-colors duration-200 tap-active
        {active ? 'text-primary-light bnav-active' : 'text-white/40 hover:text-white/70'}"
    >
      <item.icon class="h-5 w-5 shrink-0" />
      <span class="text-[10px] font-semibold leading-none tracking-wide">{item.label}</span>
    </a>
  {/each}
</nav>
