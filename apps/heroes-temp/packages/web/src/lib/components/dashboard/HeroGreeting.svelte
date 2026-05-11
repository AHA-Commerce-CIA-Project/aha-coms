<script lang="ts">
  let {
    welcome,
    name,
    role,
  }: {
    welcome: string
    name: string
    role: string
  } = $props()
</script>

<div class="relative overflow-hidden rounded-2xl bg-gradient-hero p-5 shadow-[var(--shadow-glow-blue)]">
  <!-- Decorative glows -->
  <div class="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gold/15 blur-2xl"></div>
  <div class="pointer-events-none absolute -bottom-4 left-16 h-20 w-20 rounded-full bg-sky-blue/20 blur-xl"></div>

  <div class="relative">
    <p class="text-[13px] font-medium text-white/60">{welcome}</p>
    <h1 class="mt-0.5 text-xl font-extrabold tracking-tight text-white">{name}</h1>
    <span class="mt-2 inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold capitalize text-white/90 backdrop-blur-sm">
      {role}
    </span>
  </div>
</div>
