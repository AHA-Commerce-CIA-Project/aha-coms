<script lang="ts">
  import { Search } from '@lucide/svelte'
  import * as m from '$lib/paraglide/messages'
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte'

  let {
    onOpenPalette,
  }: {
    onOpenPalette?: () => void
  } = $props()
</script>

<!--
  Sits flush under <ServiceBar> (top-0 h-16 solid #0F0E7F + shadow-md
  after the 2026-05-20 shared-chrome unification pass). Polish goals:
    • Flat solid `bg-card` so the bar reads as a calm continuation of
      the saturated ServiceBar above instead of frosted-glass with
      backdrop artifacts.
    • px-3 md:px-4 keeps the search bar's left edge near the ServiceBar
      logo column (ServiceBar uses px-4).
    • `border-b border-border/60` softens the separator below this row;
      ServiceBar's own shadow-md provides the top edge between the two
      bars.
-->
<header class="sticky top-16 z-30 hidden md:flex h-14 items-center justify-between px-3 md:px-4
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

  <!-- Notification bell moved up into <ServiceBar>'s right snippet on
       2026-05-20 so the top bar's right cluster matches FAST's
       [Bell] → [Theme] → [Avatar] sequence; this row keeps the command
       palette + language switcher as its sole utilities. -->
  <div class="flex items-center gap-2">
    <LanguageSwitcher />
  </div>
</header>
