<script lang="ts">
  type Entry = {
    rank: number
    name: string
    avatarUrl: string | null
    score: number
  }

  type Props = {
    entry: Entry
    isCurrentUser: boolean
  }

  let { entry, isCurrentUser }: Props = $props()

  function getInitials(name: string) {
    return name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
  }

  const initials = $derived(getInitials(entry.name))
</script>

<div
  class={[
    'tap-active flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all duration-200 hover:-translate-y-0.5',
    isCurrentUser
      ? 'border-primary/25 from-primary/8 bg-gradient-to-r to-transparent shadow-[var(--shadow-glow-blue)]'
      : 'border-border bg-card hover:shadow-[var(--shadow-card-hover)]',
  ].join(' ')}
>
  <!-- Rank -->
  <span class="bg-muted text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
    {entry.rank}
  </span>

  <!-- Avatar -->
  <div class="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full">
    {#if entry.avatarUrl}
      <img
        src={entry.avatarUrl}
        alt={entry.name}
        class="h-full w-full object-cover"
        width={40}
        height={40}
        loading="lazy"
        decoding="async"
      />
    {:else}
      <span class="text-primary text-sm font-bold">{initials}</span>
    {/if}
  </div>

  <!-- Name -->
  <div class="flex min-w-0 flex-1 items-center gap-2">
    <span class="text-foreground truncate text-sm font-semibold">{entry.name}</span>
    {#if isCurrentUser}
      <span class="shrink-0 rounded-full bg-gradient-to-r from-primary to-sky-blue px-2 py-0.5 text-[10px] font-bold text-white">
        You
      </span>
    {/if}
  </div>

  <!-- Score -->
  <span class="bg-primary/8 text-primary shrink-0 rounded-xl px-3 py-1 text-sm font-extrabold">
    {entry.score.toLocaleString()}
  </span>
</div>
