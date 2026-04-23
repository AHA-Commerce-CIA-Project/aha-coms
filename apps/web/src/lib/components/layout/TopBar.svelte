<script lang="ts">
  import type { SessionUser } from '$lib/auth'

  let { user }: { user: SessionUser } = $props()
</script>

<!-- Mobile-only header (hidden md+) -->
<header
  class="fixed top-9 left-0 right-0 z-50 flex h-14 items-center justify-between px-4 md:hidden
    bg-[#0d1229]/85 backdrop-blur-xl border-b border-white/10"
>
  <!-- App name -->
  <div class="flex items-center gap-2">
    <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary-dark to-primary shadow-md">
      <span class="text-[11px] font-extrabold text-white">C</span>
    </div>
    <span class="font-manrope text-[15px] font-extrabold tracking-wide text-white">
      COMS
    </span>
  </div>
</header>
