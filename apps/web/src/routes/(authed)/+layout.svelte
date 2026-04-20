<script lang="ts">
  import { onMount, setContext } from 'svelte'
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import { fetchMe, type SessionUser } from '$lib/auth'
  import Sidebar from '$lib/components/sidebar.svelte'
  import { readHandoffIntent, popStashedIntent, buildLaunchUrl } from '$lib/portal-handoff'

  let user = $state<SessionUser | null>(null)
  let checking = $state(true)

  let { children } = $props()

  setContext('user', () => user)

  onMount(async () => {
    user = await fetchMe()
    if (!user) {
      await goto(`/login?redirect=${encodeURIComponent($page.url.pathname)}`)
      return
    }

    // Intercept any authed-page entry that carries a handoff intent.
    // URL params take priority; fall back to a stashed intent from a prior login bounce.
    const intent = readHandoffIntent($page.url) ?? popStashedIntent()
    if (intent) {
      window.location.assign(buildLaunchUrl(intent))
      return
    }

    checking = false
  })
</script>

{#if checking}
  <div class="flex h-screen items-center justify-center">
    <p class="text-sm text-neutral-500">Loading...</p>
  </div>
{:else if user}
  <div class="flex h-screen">
    <Sidebar {user} />
    <main class="flex-1 overflow-y-auto">
      {@render children()}
    </main>
  </div>
{/if}
