<script lang="ts">
  import CategoryIcon from './CategoryIcon.svelte'
  import StatusBadge from './StatusBadge.svelte'

  type CategoryCode = 'BINTANG' | 'POIN_AHA' | 'PENALTI'

  interface Props {
    id: string
    categoryCode: CategoryCode
    userName: string
    reason: string
    points: number
    status: string
    createdAt: string
  }

  let { id, categoryCode, userName, reason, points, status, createdAt }: Props = $props()

  const POINT_VALUE_STYLE: Record<CategoryCode, string> = {
    PENALTI: 'text-destructive bg-destructive/8',
    BINTANG: 'text-status-pending bg-gold/12',
    POIN_AHA: 'text-primary bg-primary/8',
  }

  const prefix = $derived(categoryCode === 'PENALTI' ? '-' : '+')
  const ptStyle = $derived(POINT_VALUE_STYLE[categoryCode])
  const dateStr = $derived(
    new Date(createdAt).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
  )
</script>

<a
  href="/points/{id}"
  class="tap-active flex items-center gap-3 rounded-2xl bg-card border border-border px-4 py-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] group"
>
  <CategoryIcon code={categoryCode} size="md" />

  <div class="flex-1 min-w-0">
    <div class="flex items-center gap-2 flex-wrap">
      <span class="font-semibold text-sm text-foreground truncate">{userName}</span>
      <StatusBadge {status} />
    </div>
    <p class="text-sm text-muted-foreground truncate mt-0.5 leading-snug">{reason}</p>
    <p class="text-[11px] text-muted-foreground/60 mt-1">{dateStr}</p>
  </div>

  <span class="shrink-0 rounded-xl px-2.5 py-1.5 text-base font-extrabold leading-none {ptStyle}">
    {prefix}{points.toLocaleString()}
  </span>
</a>
