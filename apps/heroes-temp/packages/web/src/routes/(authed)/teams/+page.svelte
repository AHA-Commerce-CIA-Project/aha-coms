<script lang="ts">
  import { Card, CardHeader, CardTitle, CardContent, Button } from '@coms-portal/ui/primitives'
  import { userState } from '$lib/state/userState.svelte'
  import * as m from '$lib/paraglide/messages'
  import { Search, Plus, Users, Crown, ChevronDown, ChevronUp, Pencil } from 'lucide-svelte'

  let { data } = $props()

  type TeamRow = {
    id: string
    name: string
    branchCode?: string
    branchKey?: string
    leaderId?: string | null
    leaderName?: string | null
    memberCount?: number
  }

  type TeamMember = {
    id: string
    name: string
    email: string
    role: string
  }

  const isHrOrAdmin = $derived(userState.isHR)

  let teams = $derived((data.teams.data ?? []) as TeamRow[])
  let meta = $derived(data.teams.meta ?? { total: 0 })
  let search = $state('')
  let isLoading = $state(false)
  let expandedTeamId = $state<string | null>(null)
  let expandedMembers = $state<TeamMember[]>([])
  let loadingMembers = $state(false)

  async function fetchTeams(params?: { search?: string }) {
    const s = params?.search ?? search
    isLoading = true
    try {
      const q = s ? `?search=${encodeURIComponent(s)}&limit=100` : '?limit=100'
      const res = await fetch(`/api/v1/teams${q}`, { credentials: 'include' })
      const json = await res.json()
      teams = (json.data ?? []) as TeamRow[]
      meta = json.meta ?? { total: 0 }
    } finally {
      isLoading = false
    }
  }

  function handleSearchInput(e: Event) {
    search = (e.target as HTMLInputElement).value
    fetchTeams({ search })
  }

  async function toggleMembers(teamId: string) {
    if (expandedTeamId === teamId) {
      expandedTeamId = null
      expandedMembers = []
      return
    }
    loadingMembers = true
    expandedTeamId = teamId
    try {
      const res = await fetch(`/api/v1/teams/${teamId}`, { credentials: 'include' })
      const json = await res.json()
      expandedMembers = (json.data?.members ?? []) as TeamMember[]
    } finally {
      loadingMembers = false
    }
  }

  function branchCode(code?: string) {
    return code ?? 'ID'
  }
</script>

<div class="mx-auto max-w-6xl px-4 py-6 sm:px-6">
  <!-- Header -->
  <div class="mb-6 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <Users class="h-5 w-5 text-primary" />
      </div>
      <div>
        <h1 class="text-2xl font-bold text-foreground">{m.nav_teams()}</h1>
        <p class="mt-0.5 text-sm font-medium text-muted-foreground">
          {m.teams_total({ count: String(meta.total) })}
        </p>
      </div>
    </div>
    {#if isHrOrAdmin}
      <Button
        class="min-h-[44px] rounded-xl font-semibold shadow-[0_2px_12px_rgba(50,95,236,0.30)] transition-all duration-200 bg-gradient-to-br from-primary to-sky-blue text-white"
      >
        <Plus class="h-4 w-4" />
        {m.teams_create()}
      </Button>
    {/if}
  </div>

  <!-- Search -->
  <div class="mb-4">
    <div class="relative max-w-sm">
      <Search
        class="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/40"
      />
      <input
        type="text"
        placeholder={m.teams_search_placeholder()}
        value={search}
        oninput={handleSearchInput}
        class="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  </div>

  <!-- Team cards -->
  {#if isLoading}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each [0, 1, 2, 3, 4, 5] as _i (_i)}
        <div
          class="animate-pulse space-y-3 rounded-2xl border border-border bg-card p-5 shadow-card"
        >
          <div class="h-5 w-32 rounded-lg bg-primary/8"></div>
          <div class="h-4 w-24 rounded-lg bg-primary/6"></div>
          <div class="h-4 w-20 rounded-lg bg-primary/6"></div>
          <div class="h-8 w-full rounded-xl bg-primary/5"></div>
        </div>
      {/each}
    </div>
  {:else if teams.length === 0}
    <div class="flex flex-col items-center justify-center py-16 text-center">
      <div class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/8">
        <Users class="h-8 w-8 text-primary/40" />
      </div>
      <p class="font-semibold text-muted-foreground">{m.teams_empty()}</p>
    </div>
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each teams as team (team.id)}
        <Card class="relative overflow-hidden rounded-2xl border-border bg-card shadow-card">
          <CardHeader class="pb-3">
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-2">
                <CardTitle class="text-lg text-foreground">{team.name}</CardTitle>
                <span class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted">{branchCode(team.branchCode)}</span>
              </div>
              {#if isHrOrAdmin}
                <button
                  type="button"
                  class="flex h-9 w-9 min-h-[36px] min-w-[36px] items-center justify-center rounded-lg transition-colors hover:bg-primary/8 hover:text-primary"
                  aria-label="Edit team"
                >
                  <Pencil class="h-3.5 w-3.5" />
                </button>
              {/if}
            </div>
          </CardHeader>
          <CardContent class="space-y-3">
            <!-- Leader -->
            <div class="flex items-center gap-2 text-sm">
              <Crown class="h-4 w-4 text-gold" />
              <span class="font-medium text-foreground/70">
                {team.leaderName ?? m.teams_no_leader()}
              </span>
            </div>

            <!-- Member count -->
            {#if team.memberCount !== undefined}
              <div class="flex items-center gap-2 text-sm">
                <Users class="h-4 w-4 text-primary" />
                <span class="font-medium text-foreground/70">
                  {m.teams_members({ count: String(team.memberCount) })}
                </span>
              </div>
            {/if}

            <!-- Expand/collapse members -->
            <button
              type="button"
              class="flex min-h-[36px] w-full items-center justify-between rounded-xl px-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/6"
              onclick={() => toggleMembers(team.id)}
            >
              {expandedTeamId === team.id ? m.teams_hide_members() : m.teams_view_members()}
              {#if expandedTeamId === team.id}
                <ChevronUp class="h-3.5 w-3.5" />
              {:else}
                <ChevronDown class="h-3.5 w-3.5" />
              {/if}
            </button>

            <!-- Expanded members -->
            {#if expandedTeamId === team.id}
              <div class="mt-1 border-t border-border pt-3">
                {#if loadingMembers}
                  <div class="space-y-2 py-1">
                    {#each [0, 1, 2] as _i (_i)}
                      <div class="h-8 animate-pulse rounded-lg bg-primary/6"></div>
                    {/each}
                  </div>
                {:else if expandedMembers.length === 0}
                  <p class="text-xs text-muted-foreground">{m.teams_empty()}</p>
                {:else}
                  <ul class="space-y-1">
                    {#each expandedMembers as member (member.id)}
                      <li class="flex items-center gap-2 rounded-lg px-2 py-1.5">
                        <div
                          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary"
                        >
                          {member.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-xs font-medium text-foreground">{member.name}</p>
                          <p class="truncate text-[10px] text-muted-foreground">{member.role}</p>
                        </div>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/if}
          </CardContent>
        </Card>
      {/each}
    </div>
  {/if}
</div>
