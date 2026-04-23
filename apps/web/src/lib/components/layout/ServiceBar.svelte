<script lang="ts">
  import { goto } from '$app/navigation'
  import { signOut } from 'firebase/auth'
  import { clientAuth } from '$lib/firebase'
  import { api } from '$lib/api'
  import { Sun, Moon, LogOut, User } from 'lucide-svelte'
  import type { SessionUser } from '$lib/auth'

  let {
    apps = [],
    user,
  }: {
    apps: { slug: string; name: string }[]
    user: SessionUser | null
  } = $props()

  let dropdownOpen = $state(false)

  const initials = $derived(
    user
      ? user.name
          .split(' ')
          .map((n) => n[0])
          .slice(0, 2)
          .join('')
          .toUpperCase()
      : '',
  )

  const firstName = $derived(user ? user.name.split(' ')[0] : '')

  function toggleTheme() {
    document.documentElement.classList.toggle('dark')
    localStorage.setItem(
      'theme',
      document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    )
  }

  async function handleSignOut() {
    dropdownOpen = false
    await api.api.auth.logout.post({})
    await signOut(clientAuth)
    await goto('/login')
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') dropdownOpen = false
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="fixed top-0 left-0 right-0 z-[70] h-9 flex items-center bg-gradient-to-r from-deep-navy to-primary-dark border-b border-white/8 px-3 gap-1">
  <!-- Portal = active (control plane, no link) -->
  <div class="flex h-6 items-center px-2.5 rounded text-[11px] font-semibold bg-white/10 text-white cursor-default select-none">
    COMS
  </div>

  <!-- Registered apps the user can reach -->
  {#each apps as app (app.slug)}
    <a
      href="/api/auth/broker/launch/{app.slug}"
      class="flex h-6 items-center px-2.5 rounded text-[11px] font-semibold text-white/45 hover:text-white/80 hover:bg-white/6 transition-colors tap-active"
    >
      {app.name}
    </a>
  {/each}

  <!-- Spacer -->
  <div class="flex-1"></div>

  <!-- Theme toggle -->
  <button
    type="button"
    onclick={toggleTheme}
    class="flex h-[26px] w-[26px] items-center justify-center rounded-md text-primary-light/60 hover:text-primary-light hover:bg-white/6 transition-colors"
    aria-label="Toggle theme"
  >
    <Sun class="h-3.5 w-3.5 dark:hidden" />
    <Moon class="hidden h-3.5 w-3.5 dark:block" />
  </button>

  <!-- User avatar + name -->
  {#if user}
    <button
      type="button"
      onclick={() => (dropdownOpen = !dropdownOpen)}
      class="relative flex h-[26px] items-center gap-1.5 rounded-md px-2 hover:bg-white/6 transition-colors"
      aria-label="User menu"
      aria-expanded={dropdownOpen}
    >
      <div class="flex h-5 w-5 items-center justify-center rounded-full bg-primary-light/25 text-[8px] font-bold text-primary-light">
        {initials}
      </div>
      <span class="text-[11px] font-semibold text-primary-light/70">{firstName}</span>
    </button>
  {/if}
</div>

<!-- User dropdown -->
{#if dropdownOpen}
  <button
    type="button"
    class="fixed inset-0 z-[75]"
    onclick={() => (dropdownOpen = false)}
    aria-label="Close menu"
    tabindex="-1"
  ></button>

  <div class="fixed top-9 right-3 z-[80] w-52 rounded-xl border border-border bg-card shadow-modal overflow-hidden">
    <div class="px-4 py-3 border-b border-border">
      <p class="text-sm font-semibold text-foreground truncate">{user?.name}</p>
      <p class="text-xs text-muted-foreground truncate">{user?.email}</p>
    </div>
    <div class="p-1">
      <a
        href="/profile"
        onclick={() => (dropdownOpen = false)}
        class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <User class="h-4 w-4" />
        Profile
      </a>
      <button
        type="button"
        onclick={handleSignOut}
        class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <LogOut class="h-4 w-4" />
        Sign out
      </button>
    </div>
  </div>
{/if}
