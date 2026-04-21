<script lang="ts">
  import { goto } from '$app/navigation'
  import { signOut } from 'firebase/auth'
  import { clientAuth } from '$lib/firebase'
  import { api } from '$lib/api'
  import { Sun, Moon, User, LogOut, ChevronDown } from 'lucide-svelte'
  import type { SessionUser } from '$lib/auth'

  let { user }: { user: SessionUser } = $props()

  let dropdownOpen = $state(false)

  const initials = $derived(
    user.name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase(),
  )

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

<!-- Mobile-only header (hidden md+) -->
<header
  class="fixed top-9 left-0 right-0 z-50 flex h-14 items-center justify-between px-4 md:hidden
    bg-[#0d1229]/85 backdrop-blur-xl border-b border-white/10"
>
  <!-- App name -->
  <div class="flex items-center gap-2">
    <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary-dark to-primary shadow-md">
      <span class="text-[11px] font-extrabold text-white">C</span>
    </div>
    <span class="font-manrope text-[15px] font-extrabold tracking-wide text-white">
      COMS Portal
    </span>
  </div>

  <div class="flex items-center gap-1">
    <!-- Theme toggle -->
    <button
      type="button"
      onclick={toggleTheme}
      class="flex h-10 w-10 items-center justify-center rounded-full text-white/60 hover:bg-white/8 hover:text-white transition-colors"
      aria-label="Toggle theme"
    >
      <Sun class="h-5 w-5 dark:hidden" />
      <Moon class="hidden h-5 w-5 dark:block" />
    </button>

    <!-- Avatar / dropdown trigger -->
    <button
      type="button"
      onclick={() => (dropdownOpen = !dropdownOpen)}
      class="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-primary/30 text-xs font-bold text-primary-light ring-1 ring-white/15 hover:ring-primary-light/50 transition-all"
      aria-label="User menu"
      aria-expanded={dropdownOpen}
    >
      {initials}
    </button>
  </div>
</header>

<!-- Dropdown (shared, positioned under avatar) -->
{#if dropdownOpen}
  <button
    type="button"
    class="fixed inset-0 z-[55]"
    onclick={() => (dropdownOpen = false)}
    aria-label="Close menu"
    tabindex="-1"
  ></button>

  <div class="fixed top-[5.75rem] right-4 z-[60] w-52 rounded-xl border border-border bg-card shadow-modal md:top-[3.5rem] overflow-hidden">
    <div class="px-4 py-3 border-b border-border">
      <p class="text-sm font-semibold text-foreground truncate">{user.name}</p>
      <p class="text-xs text-muted-foreground truncate">{user.email}</p>
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
