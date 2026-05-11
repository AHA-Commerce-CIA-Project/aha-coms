<script lang="ts">
  import { Search } from 'lucide-svelte'
  import * as m from '$lib/paraglide/messages'
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte'
  import NotificationsBadge from '$lib/components/NotificationsBadge.svelte'

  let {
    unreadCount = 0,
    onOpenPalette,
  }: {
    unreadCount?: number
    onOpenPalette?: () => void
  } = $props()
</script>

<header class="sticky top-9 z-30 hidden md:flex h-14 items-center justify-between px-6
  bg-card/80 border-border border-b backdrop-blur-md
  shadow-[var(--shadow-hairline)] dark:shadow-none">

  <!-- Command palette trigger -->
  <button
    type="button"
    onclick={onOpenPalette}
    class="border-border bg-muted flex w-full max-w-xs items-center gap-2.5 rounded-xl border
      text-muted-foreground/70 h-9 px-3 text-sm transition-all
      hover:border-primary/25 hover:bg-card hover:text-muted-foreground
      cursor-pointer select-none"
    aria-label="Open command palette"
  >
    <Search class="text-muted-foreground/60 h-3.5 w-3.5 shrink-0" />
    <span class="flex-1 text-left">{m.header_search_placeholder()}</span>
    <kbd class="border-border bg-card/70 text-primary/50 flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold shadow-sm">
      <span class="text-[11px]">&#x2318;</span>K
    </kbd>
  </button>

  <div class="flex items-center gap-2">
    <LanguageSwitcher />
    <NotificationsBadge {unreadCount} />
  </div>
</header>
