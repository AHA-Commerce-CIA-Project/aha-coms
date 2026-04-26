<script lang="ts">
  import { onMount, setContext } from 'svelte'
  import { page } from '$app/stores'
  import { api } from '$lib/api'
  import ServiceBar from '$lib/components/layout/ServiceBar.svelte'
  import TopBar from '$lib/components/layout/TopBar.svelte'
  import Sidebar from '$lib/components/layout/Sidebar.svelte'
  import MobileNav from '$lib/components/layout/MobileNav.svelte'
  import { readHandoffIntent, popStashedIntent, navigateToLaunch } from '$lib/portal-handoff'

  let { data, children } = $props()

  // SSR's `hooks.server.ts` already gated this route — if we render, `user` is
  // present. The `?? null` keeps the type honest without introducing a runtime
  // branch the loading skeleton used to handle.
  const user = $derived(data.user ?? null)
  let apps = $state<{ slug: string; name: string }[]>([])
  let sidebarCollapsed = $state(true)

  setContext('user', () => user)

  onMount(async () => {
    // Restore theme preference
    const saved = localStorage.getItem('theme')
    if (saved === 'light') {
      document.documentElement.classList.remove('dark')
    } else {
      document.documentElement.classList.add('dark')
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
    <ServiceBar {apps} {user} />
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
