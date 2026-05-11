<script lang="ts">
  import { AreaChart } from 'layerchart'

  interface Props {
    data: Array<{ date: string; points: number }>
  }

  let { data }: Props = $props()

  const chartData = $derived(
    data.map((d) => ({
      date: new Date(d.date),
      points: d.points,
    }))
  )
</script>

<div class="h-64 w-full">
  {#if chartData.length < 2}
    <div class="flex h-full items-center justify-center text-sm text-muted-foreground">
      Not enough data to display trend
    </div>
  {:else}
    <AreaChart
      data={chartData}
      x="date"
      y="points"
      axis={true}
      grid={true}
      rule={true}
      points={false}
      tooltip={{ mode: 'bisect-x' }}
      padding={{ top: 8, right: 16, bottom: 32, left: 48 }}
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
