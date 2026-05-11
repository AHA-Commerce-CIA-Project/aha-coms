<script lang="ts">
  import type { Component } from 'svelte'

  let {
    icon: IconComponent,
    size = 20,
    strokeWidth = 2,
    class: className = '',
    ...restProps
  }: {
    icon: Component
    size?: number
    strokeWidth?: number
    class?: string
    [key: string]: unknown
  } = $props()
</script>

<IconComponent {size} stroke-width={strokeWidth} class={className} {...restProps} />
