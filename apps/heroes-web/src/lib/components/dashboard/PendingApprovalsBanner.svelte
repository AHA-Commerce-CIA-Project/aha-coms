<script lang="ts">
  import { Clock, ChevronRight } from 'lucide-svelte'
  import * as m from '$lib/paraglide/messages'

  let { count }: { count: number } = $props()
</script>

<a
  href="/points?status=pending"
  class="group flex items-center justify-between rounded-xl bg-card border border-gold/30 px-4 py-3 shadow-[var(--shadow-glow-gold)] hover:shadow-[var(--shadow-card-hover)] hover:border-gold/60 transition-all duration-200"
>
  <span class="flex items-center gap-2.5 text-sm font-semibold text-foreground">
    <span class="pulse-gold flex h-8 w-8 items-center justify-center rounded-full bg-gold/15">
      <Clock class="h-4 w-4 text-gold" />
    </span>
    {m.dashboard_pending_review({ count: String(count) })}
  </span>
  <ChevronRight class="h-4 w-4 shrink-0 text-gold transition-transform group-hover:translate-x-0.5" />
</a>
