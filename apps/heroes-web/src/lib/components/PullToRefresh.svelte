<script lang="ts">
  import { invalidateAll } from '$app/navigation'
  import { RefreshCw } from 'lucide-svelte'
  import type { Snippet } from 'svelte'

  let { children }: { children: Snippet } = $props()

  const THRESHOLD = 60
  const MAX_PULL = 100

  let pullDistance = $state(0)
  let refreshing = $state(false)
  let startY = 0
  let pulling = false

  // Respect prefers-reduced-motion — skip pull animation entirely
  const prefersReducedMotion =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

  function onTouchStart(e: TouchEvent) {
    if (refreshing) return
    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop
    if (scrollTop > 0) return
    startY = e.touches[0].clientY
    pulling = true
  }

  function onTouchMove(e: TouchEvent) {
    if (!pulling || refreshing || prefersReducedMotion) return
    const diff = e.touches[0].clientY - startY
    if (diff < 0) {
      pulling = false
      pullDistance = 0
      return
    }
    pullDistance = Math.min(diff * 0.4, MAX_PULL)
  }

  async function onTouchEnd() {
    if (!pulling) return
    pulling = false

    if (pullDistance >= THRESHOLD) {
      refreshing = true
      pullDistance = THRESHOLD
      await invalidateAll()
      refreshing = false
    }
    pullDistance = 0
  }

  const showIndicator = $derived((pullDistance > 10 || refreshing) && !prefersReducedMotion)
</script>

<!--
  Desktop: pointer:fine media query — touch handlers never fire on mouse-only devices,
  so no extra guard needed. The indicator is also hidden via md:hidden.
-->
<div
  ontouchstart={onTouchStart}
  ontouchmove={onTouchMove}
  ontouchend={onTouchEnd}
  role="presentation"
>
  {#if showIndicator}
    <div
      class="flex items-center justify-center overflow-hidden transition-[height] duration-200 md:hidden"
      style="height: {refreshing ? 40 : pullDistance * 0.6}px"
    >
      <RefreshCw
        class="h-5 w-5 text-primary {refreshing ? 'animate-spin' : ''}"
        style="opacity: {Math.min(pullDistance / THRESHOLD, 1)}; transform: rotate({pullDistance * 3}deg)"
      />
    </div>
  {/if}
  {@render children()}
</div>
