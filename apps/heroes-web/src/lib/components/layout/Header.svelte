<script lang="ts">
  import { Search } from '@lucide/svelte'
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

<!--
  Sits flush under <ServiceBar> (top-0 h-9 navy gradient). Polish goals:
    • Flat solid `bg-card` so the bar reads as a calm continuation of the
      saturated ServiceBar above instead of frosted-glass with backdrop
      artifacts.
    • px-3 md:px-4 brings the search bar's left edge into rough alignment
      with the ServiceBar logo (which sits in ServiceBar's own `px-3`)
      so the two bars feel grid-aligned.
    • `border-b border-border/60` softens the separator below this row;
      ServiceBar's own `border-b border-white/8` already provides the
      top edge between the two bars.
    • Dropped the light-mode hairline shadow — a flat bg + soft border
      reads more premium and avoids a stacked-shadow seam under
      ServiceBar.
-->
<header class="sticky top-9 z-30 hidden md:flex h-14 items-center justify-between px-3 md:px-4
  bg-card border-b border-border/60">

  <!-- Command palette trigger. Wider max-w-sm (was xs) and a fuller
       hover state for a more "click me" feel. Kbd shifted off
       `text-primary/50` because in dark mode `text-primary` resolves to
       deep brand navy which sits invisibly on the muted button bg;
       `text-muted-foreground/80` stays legible in both themes. -->
  <button
    type="button"
    onclick={onOpenPalette}
    class="border-border bg-muted flex w-full max-w-sm items-center gap-2.5 rounded-xl border
      text-muted-foreground/80 h-9 px-3 text-sm transition-all
      hover:border-primary/30 hover:bg-card hover:text-foreground
      cursor-pointer select-none"
    aria-label="Open command palette"
  >
    <Search class="text-muted-foreground/70 h-4 w-4 shrink-0" />
    <span class="flex-1 text-left">{m.header_search_placeholder()}</span>
    <kbd class="border-border bg-card/70 text-muted-foreground/80 flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold">
      <span class="text-[11px]">&#x2318;</span>K
    </kbd>
  </button>

  <div class="flex items-center gap-2">
    <LanguageSwitcher />
    <NotificationsBadge {unreadCount} />
  </div>
</header>
