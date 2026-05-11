<script lang="ts">
  type Variant = 'gold' | 'blue' | 'red' | 'pending'

  const VARIANT_STYLES: Record<Variant, {
    gradient: string
    iconBg: string
    iconColor: string
    valueColor: string
    titleColor: string
    glow: string
    border: string
  }> = {
    gold: {
      gradient: 'bg-gradient-summary-gold',
      iconBg: 'bg-white/25',
      iconColor: 'text-gold-dark',
      valueColor: 'text-gold-dark',
      titleColor: 'text-gold-dark/80',
      glow: 'shadow-[var(--shadow-glow-gold)]',
      border: 'border-gold/30',
    },
    blue: {
      gradient: 'bg-gradient-summary-blue',
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
      valueColor: 'text-white',
      titleColor: 'text-white/75',
      glow: 'shadow-[var(--shadow-glow-blue)]',
      border: 'border-primary/30',
    },
    red: {
      gradient: 'bg-gradient-summary-red',
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
      valueColor: 'text-white',
      titleColor: 'text-white/75',
      glow: 'shadow-[var(--shadow-glow-red)]',
      border: 'border-penalti/30',
    },
    pending: {
      gradient: 'bg-card',
      iconBg: 'bg-gold/15',
      iconColor: 'text-gold',
      valueColor: 'text-foreground',
      titleColor: 'text-muted-foreground',
      glow: 'shadow-card',
      border: 'border-gold/25',
    },
  }

  let {
    title,
    value,
    IconComponent,
    variant = 'blue',
    href,
  }: {
    title: string
    value: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    IconComponent?: any
    variant?: Variant
    href?: string
  } = $props()

  const styles = $derived(VARIANT_STYLES[variant])
  const isPending = $derived(variant === 'pending')
</script>

{#snippet cardContent()}
  <div class="relative overflow-hidden rounded-2xl border p-4 shine-on-hover
    {styles.gradient}
    {styles.border} {styles.glow}
    transition-all duration-200 hover:-translate-y-0.5
    hover:shadow-[var(--shadow-card-hover)]">

    <!-- Subtle inner highlight for colored cards -->
    {#if !isPending}
      <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 to-transparent rounded-2xl"></div>
    {/if}

    <!-- Icon -->
    <div class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg
      {styles.iconBg} {isPending ? 'pulse-gold' : ''}">
      {#if IconComponent}
        <span class="h-5 w-5 {styles.iconColor}">
          <IconComponent class="h-5 w-5" />
        </span>
      {/if}
    </div>

    <!-- Title -->
    <p class="text-[11px] font-bold leading-tight tracking-[0.06em] uppercase {styles.titleColor}">
      {title}
    </p>

    <!-- Value -->
    <p class="stat-enter mt-1.5 text-2xl font-extrabold leading-none tracking-tight {styles.valueColor}">
      {value.toLocaleString()}
    </p>
  </div>
{/snippet}

{#if href}
  <a {href} class="block group">
    {@render cardContent()}
  </a>
{:else}
  {@render cardContent()}
{/if}
