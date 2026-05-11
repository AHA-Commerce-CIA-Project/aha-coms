<script lang="ts">
  import type { Component } from 'svelte'

  /**
   * MobileBottomNav — bottom mobile chrome shared across COMS apps. Renamed
   * from Heroes' `MobileNav.svelte` per spec-02 line 168 to disambiguate from
   * other mobile-related components.
   *
   * Host-agnostic: nav items + currentPath flow in as props.
   */
  interface NavItem {
    href: string
    label: string
    icon: Component
  }

  let {
    items = [],
    currentPath = '',
  }: {
    items?: NavItem[]
    currentPath?: string
  } = $props()

  function isActive(href: string): boolean {
    if (href === '/') return currentPath === '/'
    return currentPath === href || currentPath.startsWith(href + '/')
  }
</script>

<nav
  class="fixed bottom-0 left-0 right-0 z-50 flex items-stretch md:hidden bg-[#0d1229]/85 backdrop-blur-xl border-t border-white/10 h-[calc(4rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)]"
  aria-label="Mobile navigation"
>
  {#each items as item (item.href)}
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
