<script lang="ts">
  import type { Component, Snippet } from 'svelte'
  import { Sheet, SheetContent } from '../primitives'

  /**
   * SlideOverNav — mobile-only left-anchored sheet that surfaces the full
   * navigation set when an app's MobileBottomNav can only show the top 3–5
   * frequent destinations. Generalized from heroes-web's `(authed)/+layout.svelte`
   * inline implementation in T47 once portal-web grew the same need; T43's
   * "one consumer, don't lift" call retired with the second consumer.
   *
   * Host-agnostic: nav items + currentPath flow in as props; the `brand`
   * snippet handles the per-app header mark; the `footer` snippet handles
   * the per-app footer (typically user identity, since AccountWidget owns
   * sign-out and lives in MobileTopBar's right slot). Backdrop, focus trap,
   * ESC handling, and side-anchored slide-in are carried by the `Sheet`
   * primitive (bits-ui-backed) — this component is composition, not
   * mechanics.
   */
  interface NavItem {
    href: string
    label: string
    icon: Component
  }

  let {
    open = $bindable(false),
    items = [],
    currentPath = '',
    brand,
    footer,
  }: {
    open?: boolean
    items?: NavItem[]
    currentPath?: string
    brand?: Snippet
    footer?: Snippet
  } = $props()

  function isActive(href: string): boolean {
    if (href === '/') return currentPath === '/'
    return currentPath === href || currentPath.startsWith(href + '/')
  }

  function closeMenu() {
    open = false
  }
</script>

<Sheet bind:open>
  <SheetContent side="left" class="md:hidden w-72 sm:max-w-sm p-0 bg-card flex flex-col gap-0">
    {#if brand}
      <div class="flex h-14 items-center border-b border-border px-4 shrink-0">
        {@render brand()}
      </div>
    {/if}

    <nav class="flex-1 overflow-y-auto px-2 py-3 space-y-0.5" aria-label="Application navigation">
      {#each items as item (item.href)}
        {@const active = isActive(item.href)}
        <a
          href={item.href}
          onclick={closeMenu}
          aria-current={active ? 'page' : undefined}
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-primary/8 hover:text-foreground
            {active ? 'sidebar-link-active' : ''}"
        >
          <item.icon class="h-[18px] w-[18px] shrink-0" />
          <span class="leading-none">{item.label}</span>
        </a>
      {/each}
    </nav>

    {#if footer}
      <div class="border-t border-border p-2 shrink-0">
        {@render footer()}
      </div>
    {/if}
  </SheetContent>
</Sheet>
