<script lang="ts">
  import { Star, Award, AlertTriangle, Plus, X } from 'lucide-svelte'
  import * as m from '$lib/paraglide/messages'

  let { role = '' }: { role?: string } = $props()

  let open = $state(false)

  const showPenalti = $derived(role === 'leader' || role === 'hr' || role === 'admin')

  // Tiebreaker decision (Principle 2): explicit CSS class toggle chosen over
  // Svelte transition:fade. React reference uses `transition-all duration-200`
  // with opacity+translateY; Svelte's transition:fade applies a different
  // easing curve that produces a subtly slower perceived fade-in. The explicit
  // class toggle `opacity-0 -translate-y-2 → opacity-100 translate-y-0` with
  // `transition-all duration-200` matches the React reference frame-for-frame.
</script>

<!-- Mobile FAB — fixed position, flex-col-reverse so first action sits nearest the FAB -->
<div class="fixed bottom-20 right-4 z-40 flex flex-col-reverse items-end gap-2 md:hidden">
  {#if open}
    <a
      href="/points/new/bintang"
      onclick={() => (open = false)}
      class="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold shadow-xl min-h-[44px]
        btn-gradient-gold text-gold-dark
        transition-all duration-200 opacity-100 translate-y-0"
    >
      <Star class="h-4 w-4" />
      {m.quick_action_bintang()}
    </a>
    <a
      href="/points/new/poin-aha"
      onclick={() => (open = false)}
      class="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold shadow-xl min-h-[44px]
        btn-gradient-blue text-white
        transition-all duration-200 opacity-100 translate-y-0"
    >
      <Award class="h-4 w-4" />
      {m.quick_action_poin_aha()}
    </a>
    {#if showPenalti}
      <a
        href="/points/new/penalti"
        onclick={() => (open = false)}
        class="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold shadow-xl min-h-[44px]
          btn-gradient-red text-white
          transition-all duration-200 opacity-100 translate-y-0"
      >
        <AlertTriangle class="h-4 w-4" />
        {m.quick_action_penalti()}
      </a>
    {/if}
  {/if}

  <button
    type="button"
    onclick={() => (open = !open)}
    class="flex h-14 w-14 items-center justify-center rounded-full shadow-xl
      transition-all duration-200 active:scale-95 min-h-[44px]
      {open ? 'bg-primary-dark dark:bg-primary text-white rotate-45' : 'btn-gradient-blue text-white'}"
    aria-label={m.quick_actions_label()}
    aria-expanded={open}
  >
    {#if open}
      <X class="h-5 w-5" />
    {:else}
      <Plus class="h-5 w-5" />
    {/if}
  </button>
</div>

<!-- Desktop row — hidden on mobile -->
<div class="hidden md:flex gap-3">
  <a
    href="/points/new/bintang"
    class="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold shadow-sm min-h-[44px] shine-on-hover
      btn-gradient-gold text-gold-dark"
  >
    <Star class="h-4 w-4" />
    {m.quick_action_bintang()}
  </a>
  <a
    href="/points/new/poin-aha"
    class="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold shadow-sm min-h-[44px] shine-on-hover
      btn-gradient-blue text-white"
  >
    <Award class="h-4 w-4" />
    {m.quick_action_poin_aha()}
  </a>
  {#if showPenalti}
    <a
      href="/points/new/penalti"
      class="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold shadow-sm min-h-[44px] shine-on-hover
        btn-gradient-red text-white"
    >
      <AlertTriangle class="h-4 w-4" />
      {m.quick_action_penalti()}
    </a>
  {/if}
</div>
