<script lang="ts">
  import { onMount, setContext } from 'svelte'
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import { fetchMe, type SessionUser } from '$lib/auth'
  import { api } from '$lib/api'
  import ServiceBar from '$lib/components/layout/ServiceBar.svelte'
  import TopBar from '$lib/components/layout/TopBar.svelte'
  import Sidebar from '$lib/components/layout/Sidebar.svelte'
  import MobileNav from '$lib/components/layout/MobileNav.svelte'
  import { readHandoffIntent, popStashedIntent, buildLaunchUrl } from '$lib/portal-handoff'

  let user = $state<SessionUser | null>(null)
  let apps = $state<{ slug: string; name: string }[]>([])
  let sidebarCollapsed = $state(true)
  let checking = $state(true)

  let { children } = $props()

  setContext('user', () => user)

  onMount(async () => {
    // Restore theme preference
    const saved = localStorage.getItem('theme')
    if (saved === 'light') {
      document.documentElement.classList.remove('dark')
    } else {
      document.documentElement.classList.add('dark')
    }

    user = await fetchMe()
    if (!user) {
      await goto(`/login?redirect=${encodeURIComponent($page.url.pathname)}`)
      return
    }

    // Load apps for ServiceBar (best-effort — bar renders empty if this fails)
    const { data } = await api.api.v1.dashboard.get()
    if (data) apps = data

    // Intercept handoff intents
    const intent = readHandoffIntent($page.url) ?? popStashedIntent()
    if (intent) {
      window.location.assign(buildLaunchUrl(intent))
      return
    }

    checking = false
  })
</script>

{#if checking}
  <div class="flex h-screen items-center justify-center bg-background">
    <div class="flex flex-col items-center gap-3">
      <div class="h-8 w-8 rounded-lg bg-gradient-to-br from-primary-dark to-primary animate-pulse"></div>
      <p class="text-sm text-muted-foreground">Loading…</p>
    </div>
  </div>
{:else if user}
  <div class="app-bg min-h-screen {sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}">
    <ServiceBar {apps} />
    <TopBar {user} />
    <Sidebar {user} />

    <!-- Content area: offset for ServiceBar (top) + Sidebar (left on desktop) -->
    <div class="pt-9 md:ml-[var(--sidebar-width)] transition-[margin-left] duration-200">
      <main class="page-transition pt-14 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pt-6 md:pb-8 px-4 md:px-6 max-w-screen-xl mx-auto">
        {@render children()}
      </main>
    </div>

    <MobileNav {user} />
  </div>
{/if}
