<script lang="ts">
  import { Button } from '@coms-portal/ui/primitives'
  import * as m from '$lib/paraglide/messages'
  import { goto } from '$app/navigation'
  import {
    Bell,
    Award,
    Clock,
    CheckCircle,
    XCircle,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
  } from 'lucide-svelte'

  let { data } = $props()

  type NotificationRow = {
    id: string
    type: string
    title: string
    body: string | null
    entityType: string | null
    entityId: string | null
    isRead: boolean
    createdAt: string
  }

  let notifications = $derived((data.notifications.data ?? []) as NotificationRow[])
  let meta = $derived(data.notifications.meta ?? { total: 0, page: 1, limit: 50 })
  let page = $derived(data.notifications.meta?.page ?? 1)
  let isLoading = $state(false)

  const totalPages = $derived(Math.ceil((meta.total ?? 0) / (meta.limit ?? 50)))

  function formatRelativeTime(date: Date): string {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)
    if (diffSec < 60) return m.time_just_now()
    if (diffMin < 60) return m.time_minutes_ago({ count: String(diffMin) })
    if (diffHour < 24) return m.time_hours_ago({ count: String(diffHour) })
    if (diffDay === 1) return m.time_yesterday()
    if (diffDay < 7) return m.time_days_ago({ count: String(diffDay) })
    return date.toLocaleDateString()
  }

  type LucideIcon = typeof Bell
  function iconForType(type: string): LucideIcon {
    switch (type) {
      case 'point_received':
      case 'point_approved':
        return CheckCircle
      case 'point_pending':
        return Clock
      case 'point_rejected':
        return XCircle
      case 'point_needs_approval':
        return AlertCircle
      case 'redemption_approved':
      case 'redemption_rejected':
        return Award
      default:
        return Bell
    }
  }

  function iconColorForType(type: string): string {
    switch (type) {
      case 'point_received':
      case 'point_approved':
        return 'text-status-approved'
      case 'point_pending':
      case 'point_needs_approval':
        return 'text-gold'
      case 'point_rejected':
        return 'text-destructive'
      default:
        return 'text-primary/50'
    }
  }

  async function loadPage(newPage: number) {
    isLoading = true
    try {
      const res = await fetch(`/api/v1/notifications?page=${newPage}&limit=20`, {
        credentials: 'include',
      })
      const json = await res.json()
      notifications = (json.data ?? []) as NotificationRow[]
      meta = json.meta
      page = newPage
    } finally {
      isLoading = false
    }
  }

  async function markAllRead() {
    await fetch('/api/v1/notifications/read-all', { method: 'PATCH', credentials: 'include' })
    notifications = notifications.map((n) => ({ ...n, isRead: true }))
  }

  async function handleItemClick(notif: NotificationRow) {
    if (!notif.isRead) {
      await fetch(`/api/v1/notifications/${notif.id}/read`, {
        method: 'PATCH',
        credentials: 'include',
      })
      notifications = notifications.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
    }
    if (notif.entityType === 'achievement_points' && notif.entityId) {
      goto(`/points/${notif.entityId}`)
    }
  }
</script>

<div class="mx-auto max-w-3xl space-y-4 p-4">
  <!-- Page header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <Bell class="h-5 w-5 text-primary" />
      </div>
      <div>
        <h1 class="text-xl font-extrabold text-foreground">{m.nav_notifications()}</h1>
        <p class="text-xs font-medium text-muted-foreground">
          {meta.total}
          {m.nav_notifications().toLowerCase()}
        </p>
      </div>
    </div>
    <Button
      variant="outline"
      size="sm"
      class="min-h-[36px] rounded-xl border-border text-xs font-semibold text-primary transition-all duration-200 hover:border-primary/40 hover:bg-primary/8"
      onclick={markAllRead}
    >
      {m.notifications_mark_all_read()}
    </Button>
  </div>

  <div class="space-y-1">
    {#if isLoading}
      <div class="space-y-2">
        {#each [0, 1, 2, 3, 4] as _i (_i)}
          <div class="h-16 animate-pulse rounded-xl border border-border bg-primary/4"></div>
        {/each}
      </div>
    {:else if notifications.length === 0}
      <div
        class="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card py-16 text-center shadow-card"
      >
        <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/8">
          <Bell class="h-7 w-7 text-primary/40" />
        </div>
        <p class="font-semibold text-muted-foreground">{m.notifications_empty()}</p>
      </div>
    {:else}
      {#each notifications as notif (notif.id)}
        {@const Icon = iconForType(notif.type)}
        {@const iconColor = iconColorForType(notif.type)}
        <button
          type="button"
          class="block w-full text-left transition-colors"
          onclick={() => handleItemClick(notif)}
        >
          <div
            class="flex min-h-[44px] items-start gap-3 rounded-xl border px-4 py-3 transition-colors hover:bg-primary/4 {!notif.isRead
              ? 'border-primary/15 bg-primary/5'
              : 'border-border bg-card'}"
          >
            <div class="mt-0.5 shrink-0 {iconColor}">
              <Icon class="h-5 w-5" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium leading-snug text-foreground">{notif.title}</p>
              {#if notif.body}
                <p class="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{notif.body}</p>
              {/if}
              <p class="mt-1 text-xs text-muted-foreground">
                {formatRelativeTime(new Date(notif.createdAt))}
              </p>
            </div>
            {#if !notif.isRead}
              <div class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"></div>
            {/if}
          </div>
        </button>
      {/each}
    {/if}
  </div>

  {#if totalPages > 1}
    <div class="flex items-center justify-center gap-2 pt-2">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1 || isLoading}
        onclick={() => loadPage(page - 1)}
        class="min-h-[36px] rounded-xl border-border hover:bg-primary/6 hover:text-primary"
      >
        <ChevronLeft class="h-4 w-4" />
        {m.common_previous()}
      </Button>
      <span
        class="rounded-xl border border-border bg-card px-3 py-1.5 text-sm font-semibold text-muted-foreground"
      >
        {m.common_page_of({ page: String(page), total: String(totalPages) })}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages || isLoading}
        onclick={() => loadPage(page + 1)}
        class="min-h-[36px] rounded-xl border-border hover:bg-primary/6 hover:text-primary"
      >
        {m.common_next()}
        <ChevronRight class="h-4 w-4" />
      </Button>
    </div>
  {/if}
</div>
