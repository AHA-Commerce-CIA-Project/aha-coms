<script lang="ts">
  import * as m from '$lib/paraglide/messages'

  export type ActivityItem = {
    id: string
    categoryCode: string
    categoryName: string
    points: number
    status: string
    reason: string
    userName: string
    userAvatarUrl: string | null
    submitterName: string
    createdAt: string
  }

  let { items }: { items: ActivityItem[] } = $props()

  function getInitials(name: string): string {
    return name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
  }

  function getCategoryStyle(code: string): { bg: string; text: string; dot: string } {
    const upper = code.toUpperCase()
    if (upper.includes('BINTANG')) return { bg: 'bg-gold/12', text: 'text-status-pending', dot: 'bg-gold' }
    if (upper.includes('PENALTI')) return { bg: 'bg-penalti/10', text: 'text-penalti', dot: 'bg-penalti' }
    return { bg: 'bg-primary/10', text: 'text-primary', dot: 'bg-primary' }
  }

  function getStatusStyle(status: string): { bg: string; text: string } {
    if (status === 'approved' || status === 'active') return { bg: 'bg-status-approved-bg', text: 'text-status-approved' }
    if (status === 'rejected' || status === 'revoked') return { bg: 'bg-status-rejected-bg', text: 'text-status-rejected' }
    if (status === 'challenged') return { bg: 'bg-status-challenged-bg', text: 'text-status-challenged' }
    return { bg: 'bg-status-pending-bg', text: 'text-status-pending' }
  }

  function getPointStyle(code: string): string {
    const upper = code.toUpperCase()
    if (upper.includes('PENALTI')) return 'text-destructive bg-destructive/8'
    if (upper.includes('BINTANG')) return 'text-status-pending bg-gold/12'
    return 'text-primary bg-primary/8'
  }

  function formatRelativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }
</script>

{#if items.length === 0}
  <div class="flex flex-col items-center justify-center py-10 text-center">
    <p class="text-sm text-muted-foreground">{m.activity_empty()}</p>
  </div>
{:else}
  <ul class="space-y-2">
    {#each items as item, i (item.id)}
      {@const catStyle = getCategoryStyle(item.categoryCode)}
      {@const statusStyle = getStatusStyle(item.status)}
      {@const ptStyle = getPointStyle(item.categoryCode)}
      {@const prefix = item.categoryCode.toUpperCase().includes('PENALTI') ? '-' : '+'}
      <li class="stagger-item" style="animation-delay: {i * 40}ms">
        <a
          href="/points/{item.id}"
          class="tap-active flex items-center gap-3 rounded-2xl bg-card border border-border p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] group"
        >
          <!-- Avatar -->
          <div class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary">
            {#if item.userAvatarUrl}
              <img src={item.userAvatarUrl} alt={item.userName} class="h-full w-full object-cover" />
            {:else}
              <span class="text-xs font-bold">{getInitials(item.userName)}</span>
            {/if}
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-sm font-semibold text-foreground">{item.userName}</span>
              <span class="rounded-md px-1.5 py-0.5 text-[10px] font-bold {catStyle.bg} {catStyle.text}">
                {item.categoryName}
              </span>
            </div>
            <div class="mt-0.5 flex items-center gap-2">
              <span class="rounded-full px-1.5 py-0.5 text-[10px] font-bold capitalize {statusStyle.bg} {statusStyle.text}">
                {item.status}
              </span>
              <span class="text-[11px] text-muted-foreground/70">{formatRelativeTime(item.createdAt)}</span>
            </div>
          </div>

          <!-- Points -->
          <span class="shrink-0 rounded-lg px-2 py-1 text-sm font-extrabold {ptStyle}">
            {prefix}{item.points}
          </span>
        </a>
      </li>
    {/each}
  </ul>
{/if}
