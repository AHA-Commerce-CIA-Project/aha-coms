<script lang="ts">
  import { goto } from '$app/navigation'
  import {
    Search,
    X,
    LayoutDashboard,
    Award,
    Trophy,
    Gift,
    ShoppingCart,
    Users,
    Building2,
    Settings,
    FileText,
    BarChart3,
    Bell,
    User,
    RefreshCw,
  } from 'lucide-svelte'
  import * as m from '$lib/paraglide/messages'
  import type { ComponentType } from 'svelte'

  interface CommandItem {
    id: string
    label: () => string
    href: string
    icon: ComponentType
    group: 'navigation' | 'admin'
  }

  let {
    open = $bindable(false),
    role = '',
  }: {
    open?: boolean
    role?: string
  } = $props()

  const NAV_ITEMS: CommandItem[] = [
    { id: 'dashboard', label: () => m.nav_dashboard(), href: '/dashboard', icon: LayoutDashboard, group: 'navigation' },
    { id: 'points', label: () => m.nav_points(), href: '/points', icon: Award, group: 'navigation' },
    { id: 'leaderboard', label: () => m.nav_leaderboard(), href: '/leaderboard', icon: Trophy, group: 'navigation' },
    { id: 'rewards', label: () => m.nav_rewards(), href: '/rewards', icon: Gift, group: 'navigation' },
    { id: 'redemptions', label: () => m.nav_redemptions(), href: '/redemptions', icon: ShoppingCart, group: 'navigation' },
    { id: 'notifications', label: () => m.nav_notifications(), href: '/notifications', icon: Bell, group: 'navigation' },
    { id: 'profile', label: () => m.nav_profile(), href: '/profile', icon: User, group: 'navigation' },
  ]

  const ADMIN_ITEMS: CommandItem[] = [
    { id: 'users', label: () => m.nav_users(), href: '/admin/users', icon: Users, group: 'admin' },
    { id: 'teams', label: () => m.nav_teams(), href: '/teams', icon: Building2, group: 'admin' },
    { id: 'reports', label: () => m.nav_reports(), href: '/reports', icon: BarChart3, group: 'admin' },
    { id: 'audit-log', label: () => m.nav_audit_log(), href: '/admin/audit-log', icon: FileText, group: 'admin' },
    { id: 'sheet-sync', label: () => 'Sheet Sync', href: '/admin/sheet-sync', icon: RefreshCw, group: 'admin' },
    { id: 'settings', label: () => m.nav_settings(), href: '/admin/settings', icon: Settings, group: 'admin' },
  ]

  const isAdminOrHr = $derived(role === 'admin' || role === 'hr')
  const allItems = $derived(isAdminOrHr ? [...NAV_ITEMS, ...ADMIN_ITEMS] : NAV_ITEMS)

  let query = $state('')
  let activeIndex = $state(0)
  let inputEl = $state<HTMLInputElement | null>(null)
  let listEl = $state<HTMLDivElement | null>(null)

  // Focus-return shim (Principle 2 compatibility): store active element before
  // palette opens so we can restore focus when it closes — matches React cmdk behaviour.
  let previouslyFocused: Element | null = null

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allItems
    return allItems.filter((item) => item.label().toLowerCase().includes(q))
  })

  const navFiltered = $derived(filtered.filter((i) => i.group === 'navigation'))
  const adminFiltered = $derived(filtered.filter((i) => i.group === 'admin'))
  const flatFiltered = $derived([...navFiltered, ...adminFiltered])

  function handleSelect(item: CommandItem) {
    goto(item.href)
    close()
  }

  function close() {
    open = false
    query = ''
    activeIndex = 0
    // Restore focus to the element that had it before the palette opened
    if (previouslyFocused instanceof HTMLElement) {
      previouslyFocused.focus()
    }
  }

  // Reset + focus when opened; capture previous focus for return shim
  $effect(() => {
    if (open) {
      previouslyFocused = document.activeElement
      query = ''
      activeIndex = 0
      requestAnimationFrame(() => inputEl?.focus())
    }
  })

  // Clamp active index when filtered list changes
  $effect(() => {
    if (activeIndex >= flatFiltered.length) {
      activeIndex = Math.max(0, flatFiltered.length - 1)
    }
  })

  // Scroll active item into view
  $effect(() => {
    if (!listEl) return
    const active = listEl.querySelector('[data-active="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  })

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return
    if (e.key === 'Escape') {
      close()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeIndex = Math.min(activeIndex + 1, flatFiltered.length - 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeIndex = Math.max(activeIndex - 1, 0)
    } else if (e.key === 'Enter') {
      const item = flatFiltered[activeIndex]
      if (item) handleSelect(item)
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- Backdrop -->
  <button
    type="button"
    class="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm"
    onclick={close}
    aria-hidden="true"
    tabindex="-1"
  ></button>

  <!-- Desktop modal / Mobile full-screen -->
  <div
    role="dialog"
    aria-modal="true"
    aria-label="Command palette"
    class="fixed z-[101]
      inset-0 flex flex-col bg-card
      md:inset-auto md:top-[20vh] md:left-1/2 md:-translate-x-1/2
      md:w-full md:max-w-xl md:rounded-2xl
      md:border md:border-border
      md:bg-card/95 md:backdrop-blur-xl
      md:shadow-[var(--shadow-modal)]
      md:overflow-hidden"
  >
    <!-- Search input row -->
    <div class="flex items-center gap-3 border-b border-border px-4 py-3">
      <Search class="h-4 w-4 shrink-0 text-primary/60" />
      <input
        bind:this={inputEl}
        type="text"
        bind:value={query}
        placeholder={m.header_search_placeholder()}
        class="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        aria-autocomplete="list"
        aria-controls="command-palette-list"
        aria-activedescendant={flatFiltered[activeIndex] ? `cmd-item-${flatFiltered[activeIndex].id}` : undefined}
      />
      <!-- ⌘K badge — desktop only -->
      <kbd class="hidden md:flex items-center gap-0.5 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground select-none">
        <span class="text-[11px]">⌘</span>K
      </kbd>
      <!-- Close button — mobile only -->
      <button
        type="button"
        onclick={close}
        class="flex md:hidden h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/8 hover:text-primary transition-colors"
        aria-label="Close"
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <!-- Results -->
    <div
      bind:this={listEl}
      id="command-palette-list"
      role="listbox"
      class="flex-1 overflow-y-auto px-2 py-2 md:max-h-[400px]"
    >
      {#if flatFiltered.length === 0}
        <div class="flex flex-col items-center justify-center py-10 text-center text-sm text-muted-foreground">
          <Search class="mb-3 h-8 w-8 opacity-20" />
          <p>No results for &ldquo;{query}&rdquo;</p>
        </div>
      {:else}
        {#if navFiltered.length > 0}
          <div>
            <p class="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-widest text-primary/40">
              Navigation
            </p>
            {#each navFiltered as item (item.id)}
              {@const globalIdx = flatFiltered.indexOf(item)}
              {@const isActive = globalIdx === activeIndex}
              <button
                id="cmd-item-{item.id}"
                role="option"
                aria-selected={isActive}
                data-active={isActive}
                type="button"
                onclick={() => handleSelect(item)}
                onmouseenter={() => (activeIndex = globalIdx)}
                class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors
                  text-foreground/80 hover:bg-primary/8 hover:text-foreground
                  {isActive ? 'bg-primary/10 text-primary' : ''}"
              >
                <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg
                  {isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}">
                  <item.icon class="h-3.5 w-3.5" />
                </span>
                <span class="font-medium">{item.label()}</span>
              </button>
            {/each}
          </div>
        {/if}

        {#if adminFiltered.length > 0}
          <div class={navFiltered.length > 0 ? 'mt-2' : ''}>
            <p class="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-widest text-primary/40">
              Admin
            </p>
            {#each adminFiltered as item (item.id)}
              {@const globalIdx = flatFiltered.indexOf(item)}
              {@const isActive = globalIdx === activeIndex}
              <button
                id="cmd-item-{item.id}"
                role="option"
                aria-selected={isActive}
                data-active={isActive}
                type="button"
                onclick={() => handleSelect(item)}
                onmouseenter={() => (activeIndex = globalIdx)}
                class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors
                  text-foreground/80 hover:bg-primary/8 hover:text-foreground
                  {isActive ? 'bg-primary/10 text-primary' : ''}"
              >
                <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg
                  {isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}">
                  <item.icon class="h-3.5 w-3.5" />
                </span>
                <span class="font-medium">{item.label()}</span>
              </button>
            {/each}
          </div>
        {/if}
      {/if}
    </div>

    <!-- Footer hint — desktop only -->
    <div class="hidden md:flex items-center gap-3 border-t border-border px-4 py-2">
      <span class="flex items-center gap-1 text-[10px] text-muted-foreground/50">
        <kbd class="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[9px]">↑↓</kbd>
        navigate
      </span>
      <span class="flex items-center gap-1 text-[10px] text-muted-foreground/50">
        <kbd class="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[9px]">↵</kbd>
        open
      </span>
      <span class="flex items-center gap-1 text-[10px] text-muted-foreground/50">
        <kbd class="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[9px]">esc</kbd>
        close
      </span>
    </div>
  </div>
{/if}
