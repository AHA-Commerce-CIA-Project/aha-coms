<script lang="ts">
  interface Props {
    status: string
    class?: string
  }

  let { status, class: className = '' }: Props = $props()

  type StatusConfig = { label: string; className: string }

  const statusConfig: Record<string, StatusConfig> = {
    active: {
      label: 'active',
      className:
        'bg-status-approved-bg text-status-approved border border-status-approved/20 dark:bg-status-approved-bg dark:text-status-approved dark:border-status-approved/20',
    },
    pending: {
      label: 'pending',
      className:
        'bg-status-pending-bg text-status-pending border border-status-pending/20 dark:bg-status-pending-bg dark:text-status-pending dark:border-status-pending/20',
    },
    challenged: {
      label: 'challenged',
      className:
        'bg-status-challenged-bg text-status-challenged border border-status-challenged/20 dark:bg-status-challenged-bg dark:text-status-challenged dark:border-status-challenged/20',
    },
    frozen: {
      label: 'frozen',
      className:
        'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700',
    },
    revoked: {
      label: 'revoked',
      className:
        'bg-status-rejected-bg text-status-rejected border border-status-rejected/20 dark:bg-status-rejected-bg dark:text-status-rejected dark:border-status-rejected/20',
    },
    rejected: {
      label: 'rejected',
      className:
        'bg-status-rejected-bg text-status-rejected border border-status-rejected/20 dark:bg-status-rejected-bg dark:text-status-rejected dark:border-status-rejected/20',
    },
  }

  const config = $derived(statusConfig[status] ?? { label: status, className: 'bg-muted text-muted-foreground border border-border' })
</script>

<span
  class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold leading-none tracking-wide capitalize {config.className} {className}"
>
  {config.label}
</span>
