<script lang="ts">
  import { BarChart } from 'layerchart'

  interface Props {
    data: Array<{ name: string; totalPoints: number }>
  }

  let { data }: Props = $props()

  // Take top 10 and truncate long names for display
  const chartData = $derived(
    data.slice(0, 10).map((d) => ({
      name: d.name.length > 14 ? d.name.slice(0, 13) + '…' : d.name,
      totalPoints: d.totalPoints,
    }))
  )
</script>

<div class="h-72 w-full">
  {#if chartData.length === 0}
    <div class="flex h-full items-center justify-center text-sm text-muted-foreground">
      No data to display
    </div>
  {:else}
    <BarChart
      data={chartData}
      x="name"
      y="totalPoints"
      orientation="horizontal"
      axis={true}
      grid={false}
      rule={false}
      tooltip={{ mode: 'band' }}
      props={{
        bars: {
          class: 'fill-primary/80 hover:fill-primary transition-colors',
          radius: 3,
        },
        tooltip: {
          root: { class: 'layerchart-tooltip' },
          item: {},
        },
      }}
    />
  {/if}
</div>
