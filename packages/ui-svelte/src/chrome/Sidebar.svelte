<script lang="ts">
  import type { Component, Snippet } from 'svelte'

  /**
   * Sidebar — desktop chrome shared across COMS apps.
   *
   * Host-agnostic: nav items + their active-state predicate + collapsed-state
   * handlers come in as props. The host owns nav data, routing (via `currentPath`),
   * and any role-gating logic that decides which items are visible.
   *
   * Slots:
   *   - `logo`: brand mark + name shown at the top.
   *   - `footer`: bottom area; portal mounts the account widget here, Heroes
   *     mounts its own user-info block. Default footer is empty.
   */
  interface NavItem {
    href: string
    label: string
    icon: Component
  }

  interface NavSection {
    /** Optional section heading (rendered above the items in expanded state). */
    label?: string
    items: NavItem[]
  }

  let {
    sections = [],
    currentPath = '',
    collapsed = true,
    onCollapsedChange,
    logo,
    footer,
  }: {
    sections?: NavSection[]
    currentPath?: string
    collapsed?: boolean
    onCollapsedChange?: (next: boolean) => void
    logo?: Snippet<[{ collapsed: boolean }]>
    footer?: Snippet<[{ collapsed: boolean }]>
  } = $props()

  function isActive(href: string): boolean {
    if (href === '/') return currentPath === '/'
    return currentPath === href || currentPath.startsWith(href + '/')
  }
</script>

<aside
  class="fixed top-9 left-0 z-40 hidden md:flex h-[calc(100vh-2.25rem)] flex-col transition-[width] duration-200 bg-card border-r border-border
    {collapsed ? 'w-16' : 'w-64'}"
  onmouseenter={() => onCollapsedChange?.(false)}
  onmouseleave={() => onCollapsedChange?.(true)}
  role="navigation"
  aria-label="Main navigation"
>
  {#if logo}
    <div class="flex h-14 items-center border-b border-border {collapsed ? 'justify-center px-0' : 'px-4'}">
      {@render logo({ collapsed })}
    </div>
  {/if}

  <nav class="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
    {#each sections as section, sectionIdx (sectionIdx)}
      {#if section.label && sectionIdx > 0}
        <div class="pt-4 pb-1.5 {collapsed ? 'px-1' : 'px-3'}">
          {#if !collapsed}
            <span class="section-label text-muted-foreground/50">{section.label}</span>
          {:else}
            <div class="border-t border-border"></div>
          {/if}
        </div>
      {/if}
      {#each section.items as item (item.href)}
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
    {/each}
  </nav>

  {#if footer}
    <div class="border-t border-border p-2">
      {@render footer({ collapsed })}
    </div>
  {/if}
</aside>
