<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import { signOut } from 'firebase/auth'
  import { clientAuth } from '$lib/firebase'
  import { api } from '$lib/api'
  import type { SessionUser } from '$lib/auth'

  let { user }: { user: SessionUser } = $props()

  const NAV = [
    { href: '/', label: 'Dashboard' },
    { href: '/profile', label: 'Profile' },
  ]

  const ADMIN_NAV = [
    { href: '/admin/employees', label: 'Employees' },
    { href: '/admin/teams', label: 'Teams' },
    { href: '/admin/audit', label: 'Audit Log' },
  ]

  const SUPER_NAV = [
    { href: '/admin/apps', label: 'App Registry' },
    { href: '/admin/workspace-sync', label: 'Workspace Sync' },
  ]

  const isAdmin = $derived(user.portalRole === 'admin' || user.portalRole === 'super_admin')
  const isSuperAdmin = $derived(user.portalRole === 'super_admin')

  async function handleSignOut() {
    await api.api.auth.logout.post({})
    await signOut(clientAuth)
    await goto('/login')
  }

  function isActive(href: string): boolean {
    if (href === '/') return $page.url.pathname === '/'
    return $page.url.pathname.startsWith(href)
  }
</script>

<aside class="flex w-56 flex-col border-r border-neutral-800 bg-neutral-950 px-3 py-6">
  <div class="mb-6 px-2">
    <p class="text-xs font-semibold tracking-widest text-indigo-400 uppercase">COMS</p>
  </div>

  <nav class="flex-1 space-y-0.5">
    {#each NAV as { href, label }}
      <a
        {href}
        class="block rounded-lg px-2 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900 hover:text-white"
        class:bg-neutral-900={isActive(href)}
        class:text-white={isActive(href)}
        class:font-medium={isActive(href)}
      >
        {label}
      </a>
    {/each}

    {#if isAdmin}
      <p class="mt-4 mb-1 px-2 text-xs text-neutral-600 uppercase tracking-wider">Admin</p>
      {#each ADMIN_NAV as { href, label }}
        <a
          {href}
          class="block rounded-lg px-2 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900 hover:text-white"
          class:bg-neutral-900={isActive(href)}
          class:text-white={isActive(href)}
          class:font-medium={isActive(href)}
        >
          {label}
        </a>
      {/each}
    {/if}

    {#if isSuperAdmin}
      {#each SUPER_NAV as { href, label }}
        <a
          {href}
          class="block rounded-lg px-2 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900 hover:text-white"
          class:bg-neutral-900={isActive(href)}
          class:text-white={isActive(href)}
          class:font-medium={isActive(href)}
        >
          {label}
        </a>
      {/each}
    {/if}
  </nav>

  <div class="border-t border-neutral-800 pt-4">
    <div class="mb-3 px-2">
      <p class="text-xs font-medium truncate">{user.name}</p>
      <p class="text-xs text-neutral-500 truncate">{user.email}</p>
    </div>
    <button
      onclick={handleSignOut}
      class="w-full rounded-lg px-2 py-1.5 text-left text-xs text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
    >
      Sign out
    </button>
  </div>
</aside>
