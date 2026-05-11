<script lang="ts">
  import { Bell } from 'lucide-svelte'

  let { unreadCount = 0 }: { unreadCount?: number } = $props()

  const display = $derived(unreadCount > 99 ? '99+' : String(unreadCount))
</script>

<a
  href="/notifications"
  class="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/8 hover:text-primary transition-colors"
  aria-label="Notifications"
>
  <Bell class="h-[18px] w-[18px]" />
  {#if unreadCount > 0}
    <span
      class="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[9px] leading-none font-bold text-gold-dark tracking-[0.04em]"
    >
      {display}
    </span>
  {/if}
</a>
