<script lang="ts">
  import { AreaChart } from 'layerchart'

  interface Props {
    data: Array<{ date: string; value: number }>
  }

  let { data }: Props = $props()

  const chartData = $derived(
    data.map((d) => ({
      date: new Date(d.date),
      value: d.value,
    }))
  )
</script>

<!-- Sparkline: no axes, just the shape, 64px tall -->
<div class="h-16 w-full">
  {#if chartData.length < 2}
    <div class="flex h-full items-center justify-center text-xs text-muted-foreground">
      Not enough data
    </div>
  {:else}
    <AreaChart
      data={chartData}
      x="date"
      y="value"
      axis={false}
      grid={false}
      rule={false}
      points={false}
      padding={{ top: 4, right: 0, bottom: 4, left: 0 }}
      props={{
        area: {
          class: 'fill-primary/20',
        },
        line: {
          class: 'stroke-primary stroke-2',
        },
      }}
    />
  {/if}
</div>
