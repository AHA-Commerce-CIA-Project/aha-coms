<script lang="ts">
  import { Button, Badge, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@coms-portal/ui/primitives'
  import * as m from '$lib/paraglide/messages'
  import { buildSearchParams } from '$lib/utils'
  import { Search, Plus, User, Pencil, Archive, ChevronLeft, ChevronRight } from 'lucide-svelte'

  let { data } = $props()

  type UserRow = {
    id: string
    name: string
    email: string
    role: string
    teamName: string | null
    isActive: boolean
  }

  let users = $derived((data.users as UserRow[]) ?? [])
  let meta = $derived(data.meta ?? { total: 0, page: 1, limit: 100 })
  let search = $state('')
  let roleFilter = $state('')
  let activeFilter = $state('')
  let page = $derived(data.meta?.page ?? 1)
  let isLoading = $state(false)

  const totalPages = $derived(Math.ceil(meta.total / (meta.limit ?? 100)))

  const ROLE_BADGE: Record<string, string> = {
    admin:
      'bg-gradient-to-br from-primary/15 to-sky-blue/10 text-primary border-primary/25 dark:text-sky-blue',
    hr: 'bg-primary/8 text-primary border-primary/20',
    leader: 'bg-purple/10 text-purple border-purple/25 dark:text-purple-light',
    employee: 'bg-muted text-muted-foreground border-border',
  }

  function roleBadgeClass(role: string) {
    return ROLE_BADGE[role] ?? ROLE_BADGE.employee
  }

  async function fetchUsers(params?: {
    search?: string
    role?: string
    isActive?: string
    page?: number
  }) {
    isLoading = true
    const s = params?.search ?? search
    const r = params?.role ?? roleFilter
    const a = params?.isActive ?? activeFilter
    const p = params?.page ?? page
    try {
      const query = buildSearchParams({
        limit: '20',
        page: String(p),
        search: s,
        role: r,
        isActive: a !== '' ? a : null,
      })
      const res = await fetch(`/api/v1/users?${query}`, { credentials: 'include' })
      const json = await res.json()
      users = (json.data ?? []) as UserRow[]
      meta = json.meta ?? { total: 0, page: p, limit: 20 }
    } finally {
      isLoading = false
    }
  }

  function handleSearch(e: Event) {
    search = (e.target as HTMLInputElement).value
    page = 1
    fetchUsers({ search, page: 1 })
  }

  function handleRoleFilter(e: Event) {
    roleFilter = (e.target as HTMLSelectElement).value === 'all' ? '' : (e.target as HTMLSelectElement).value
    page = 1
    fetchUsers({ role: roleFilter, page: 1 })
  }

  function handleActiveFilter(e: Event) {
    activeFilter = (e.target as HTMLSelectElement).value === 'all' ? '' : (e.target as HTMLSelectElement).value
    page = 1
    fetchUsers({ isActive: activeFilter, page: 1 })
  }
</script>

<div class="page-transition mx-auto max-w-6xl px-4 py-6 sm:px-6">
  <!-- Header -->
  <div class="mb-6 flex items-center justify-between gap-3">
    <div class="flex items-center gap-3">
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-sky-blue shadow-[var(--shadow-card)]"
      >
        <User class="h-5 w-5 text-white" />
      </div>
      <div>
        <h1 class="text-xl font-extrabold text-foreground">{m.nav_users()}</h1>
        <p class="mt-0.5 text-[13px] font-medium text-muted-foreground">
          {m.users_total({ count: String(meta.total) })}
        </p>
      </div>
    </div>
    <Button
      href="/admin/users/new"
      class="h-9 shrink-0 rounded-xl px-4 font-semibold shadow-[var(--shadow-card)] bg-gradient-to-br from-primary to-sky-blue text-white"
    >
      <Plus class="h-4 w-4" />
      {m.users_add()}
    </Button>
  </div>

  <!-- Filters -->
  <div
    class="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-card sm:flex-row sm:items-center"
  >
    <div class="relative flex-1">
      <Search class="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        placeholder={m.users_search_placeholder()}
        value={search}
        oninput={handleSearch}
        class="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
    <select
      value={roleFilter || 'all'}
      onchange={handleRoleFilter}
      class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 sm:w-36"
    >
      <option value="all">{m.users_all_roles()}</option>
      <option value="admin">Admin</option>
      <option value="hr">HR</option>
      <option value="leader">Leader</option>
      <option value="employee">Employee</option>
    </select>
    <select
      value={activeFilter || 'all'}
      onchange={handleActiveFilter}
      class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 sm:w-36"
    >
      <option value="all">{m.users_all_status()}</option>
      <option value="true">{m.status_active()}</option>
      <option value="false">{m.status_archived()}</option>
    </select>
  </div>

  <!-- Table -->
  <div class="overflow-hidden rounded-xl border border-border bg-card shadow-card">
    <Table>
      <TableHeader>
        <TableRow class="border-b border-border bg-muted/60">
          <TableHead class="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
            {m.users_col_name()}
          </TableHead>
          <TableHead class="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
            {m.users_col_role()}
          </TableHead>
          <TableHead class="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
            {m.users_col_team()}
          </TableHead>
          <TableHead class="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
            {m.users_col_status()}
          </TableHead>
          <TableHead class="w-24"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {#if isLoading}
          {#each [0, 1, 2, 3, 4] as _i (_i)}
            <TableRow class="border-b border-border/50">
              <TableCell>
                <div class="flex items-center gap-3">
                  <div class="h-8 w-8 animate-pulse rounded-full bg-primary/8"></div>
                  <div class="space-y-1.5">
                    <div class="h-3.5 w-32 animate-pulse rounded bg-primary/8"></div>
                    <div class="h-3 w-24 animate-pulse rounded bg-primary/5"></div>
                  </div>
                </div>
              </TableCell>
              <TableCell><div class="h-5 w-16 animate-pulse rounded-full bg-primary/8"></div></TableCell>
              <TableCell><div class="h-3.5 w-20 animate-pulse rounded bg-primary/5"></div></TableCell>
              <TableCell><div class="h-5 w-14 animate-pulse rounded-full bg-primary/8"></div></TableCell>
              <TableCell><div class="h-6 w-12 animate-pulse rounded bg-primary/5"></div></TableCell>
            </TableRow>
          {/each}
        {:else}
          {#each users as user (user.id)}
            <TableRow class="border-b border-border/50 transition-colors hover:bg-muted/40">
              <TableCell>
                <a href="/admin/users/{user.id}" class="flex items-center gap-3">
                  <div
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                  >
                    <User class="h-4 w-4" />
                  </div>
                  <div>
                    <p class="font-semibold text-foreground transition-colors hover:text-primary">
                      {user.name}
                    </p>
                    <p class="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </a>
              </TableCell>
              <TableCell>
                <Badge variant="outline" class="text-xs font-semibold {roleBadgeClass(user.role)}">
                  {user.role}
                </Badge>
              </TableCell>
              <TableCell class="text-sm text-muted-foreground">{user.teamName ?? '—'}</TableCell>
              <TableCell>
                <span
                  class="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold {user.isActive
                    ? 'bg-status-approved-bg text-status-approved dark:bg-status-approved/20 dark:text-status-approved'
                    : 'bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive'}"
                >
                  {user.isActive ? m.status_active() : m.status_archived()}
                </span>
              </TableCell>
              <TableCell>
                <div class="flex items-center gap-1">
                  <a
                    href="/admin/users/{user.id}"
                    class="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/8 hover:text-primary"
                    aria-label={m.common_edit()}
                  >
                    <Pencil class="h-3.5 w-3.5" />
                  </a>
                  {#if user.isActive}
                    <button
                      type="button"
                      class="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/8 hover:text-destructive"
                      aria-label={m.status_archived()}
                    >
                      <Archive class="h-3.5 w-3.5" />
                    </button>
                  {/if}
                </div>
              </TableCell>
            </TableRow>
          {:else}
            <TableRow>
              <TableCell colspan={5} class="py-16">
                <div class="flex flex-col items-center gap-3 text-center">
                  <div class="flex h-14 w-14 items-center justify-center rounded-full bg-primary/8">
                    <User class="h-6 w-6 text-primary/50" />
                  </div>
                  <p class="text-sm font-medium text-muted-foreground">{m.users_empty()}</p>
                </div>
              </TableCell>
            </TableRow>
          {/each}
        {/if}
      </TableBody>
    </Table>

    {#if totalPages > 1}
      <div
        class="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-3"
      >
        <p class="text-[13px] font-medium text-muted-foreground">
          {m.common_page_of({ page: String(page), total: String(totalPages) })}
        </p>
        <div class="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onclick={() => { page -= 1; fetchUsers({ page }) }}
            class="h-8 w-8 border-border p-0 text-primary hover:bg-primary/8 disabled:opacity-40"
          >
            <ChevronLeft class="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onclick={() => { page += 1; fetchUsers({ page }) }}
            class="h-8 w-8 border-border p-0 text-primary hover:bg-primary/8 disabled:opacity-40"
          >
            <ChevronRight class="h-4 w-4" />
          </Button>
        </div>
      </div>
    {/if}
  </div>
</div>
