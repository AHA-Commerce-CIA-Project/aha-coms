<script lang="ts">
  let {
    apps = [],
  }: {
    apps: { slug: string; name: string }[]
  } = $props()
</script>

<div class="fixed top-0 left-0 right-0 z-[70] h-9 flex items-center bg-[#080c1e] border-b border-white/8 px-3 gap-1">
  <!-- Portal = active (control plane, no link) -->
  <div class="flex h-6 items-center px-2.5 rounded text-[11px] font-semibold bg-white/10 text-white cursor-default select-none">
    COMS Portal
  </div>

  <!-- Registered apps the user can reach -->
  {#each apps as app (app.slug)}
    <a
      href="/api/auth/broker/launch/{app.slug}"
      class="flex h-6 items-center px-2.5 rounded text-[11px] font-semibold text-white/45 hover:text-white/80 hover:bg-white/6 transition-colors tap-active"
    >
      {app.name}
    </a>
  {/each}
</div>
