<script lang="ts">
  import { createAliasQueueQuery, createResolveAliasMutation, createRejectAliasMutation } from '$lib/queries/aliases'
  import { adminApi } from '$lib/admin-api'
  import type { AliasQueueItem } from '$lib/admin-api'

  const query = createAliasQueueQuery()
  const resolveMutation = createResolveAliasMutation()
  const rejectMutation = createRejectAliasMutation()

  // Resolve modal state
  let resolveItem = $state<AliasQueueItem | null>(null)
  let resolveSearch = $state('')
  let resolveResults = $state<Array<{ id: string; name: string; email: string }>>([])
  let selectedIdentityId = $state<string | null>(null)
  let selectedIdentityName = $state<string | null>(null)
  let resolveError = $state<string | null>(null)
  let resolveSuccess = $state<string | null>(null)
  let searchDebounce = $state<ReturnType<typeof setTimeout> | null>(null)

  // Reject modal state
  let rejectItem = $state<AliasQueueItem | null>(null)
  let rejectReason = $state('')
  let rejectError = $state<string | null>(null)
  let rejectSuccess = $state<string | null>(null)

  function openResolveModal(item: AliasQueueItem) {
    resolveItem = item
    resolveSearch = ''
    resolveResults = []
    resolveError = null
    resolveSuccess = null
    // Pre-select suggested identity if available
    if (item.suggestedIdentityUserId) {
      selectedIdentityId = item.suggestedIdentityUserId
      selectedIdentityName = '(pre-selected suggestion — confirm below)'
    } else {
      selectedIdentityId = null
      selectedIdentityName = null
    }
  }

  function closeResolveModal() {
    resolveItem = null
    resolveSearch = ''
    resolveResults = []
    selectedIdentityId = null
    selectedIdentityName = null
    resolveError = null
    resolveSuccess = null
  }

  function openRejectModal(item: AliasQueueItem) {
    rejectItem = item
    rejectReason = ''
    rejectError = null
    rejectSuccess = null
  }

  function closeRejectModal() {
    rejectItem = null
    rejectReason = ''
    rejectError = null
    rejectSuccess = null
  }

  function onSearchInput() {
    if (searchDebounce) clearTimeout(searchDebounce)
    const q = resolveSearch.trim()
    if (q.length < 2) {
      resolveResults = []
      return
    }
    searchDebounce = setTimeout(async () => {
      try {
        resolveResults = await adminApi.searchUsers(q)
      } catch {
        resolveResults = []
      }
    }, 300)
  }

  function selectIdentity(id: string, name: string, email: string) {
    selectedIdentityId = id
    selectedIdentityName = `${name} (${email})`
    resolveResults = []
    resolveSearch = ''
  }

  async function submitResolve() {
    if (!resolveItem || !selectedIdentityId) return
    resolveError = null
    resolveSuccess = null
    try {
      await $resolveMutation.mutateAsync({ id: resolveItem.id, identityUserId: selectedIdentityId })
      resolveSuccess = `"${resolveItem.rawName}" resolved successfully.`
      setTimeout(closeResolveModal, 1500)
    } catch (err) {
      resolveError = err instanceof Error ? err.message : 'Resolve failed'
    }
  }

  async function submitReject() {
    if (!rejectItem || !rejectReason.trim()) return
    rejectError = null
    rejectSuccess = null
    try {
      await $rejectMutation.mutateAsync({ id: rejectItem.id, reason: rejectReason.trim() })
      rejectSuccess = `"${rejectItem.rawName}" rejected.`
      setTimeout(closeRejectModal, 1500)
    } catch (err) {
      rejectError = err instanceof Error ? err.message : 'Reject failed'
    }
  }

  function formatRelativeDate(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'today'
    if (days === 1) return '1 day ago'
    return `${days} days ago`
  }
</script>

<div class="p-8">
  <div class="mb-6">
    <h1 class="text-xl font-semibold">Alias Collision Queue</h1>
    <p class="mt-1 text-sm text-muted-foreground">
      Pending name collisions that need admin resolution — resolve to an existing identity or reject.
    </p>
  </div>

  {#if $query.isLoading}
    <div class="animate-pulse space-y-3">
      {#each Array(3) as _}
        <div class="h-20 rounded-lg bg-muted"></div>
      {/each}
    </div>
  {:else if $query.error}
    <p class="text-sm text-destructive">Failed to load queue: {$query.error instanceof Error ? $query.error.message : 'Unknown error'}</p>
  {:else if $query.data}
    {#if $query.data.groups.length === 0}
      <p class="text-sm text-muted-foreground">No pending collisions.</p>
    {:else}
      <div class="space-y-6">
        {#each $query.data.groups as group}
          <div class="rounded-lg border border-border bg-card">
            <div class="border-b border-border px-4 py-3">
              <span class="font-medium">"{group.rawNameNormalized}"</span>
              <span class="ml-2 text-sm text-muted-foreground">
                — {group.count} pending, oldest {formatRelativeDate(group.oldestAt)}
              </span>
            </div>
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border/50 text-left text-xs text-muted-foreground">
                  <th class="px-4 pb-2 pt-3 font-medium">Raw Name</th>
                  <th class="px-4 pb-2 pt-3 font-medium">Source</th>
                  <th class="px-4 pb-2 pt-3 font-medium">Context</th>
                  <th class="px-4 pb-2 pt-3 font-medium">Received</th>
                  <th class="px-4 pb-2 pt-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {#each group.items as item}
                  <tr class="border-b border-border/30 hover:bg-accent">
                    <td class="px-4 py-2 font-medium">{item.rawName}</td>
                    <td class="px-4 py-2 text-muted-foreground">{item.source}</td>
                    <td class="px-4 py-2 text-muted-foreground text-xs">
                      {Object.keys(item.context).length > 0 ? JSON.stringify(item.context) : '—'}
                    </td>
                    <td class="px-4 py-2 text-muted-foreground">{formatRelativeDate(item.createdAt)}</td>
                    <td class="px-4 py-2">
                      <div class="flex gap-2">
                        <button
                          type="button"
                          onclick={() => openResolveModal(item)}
                          class="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary/80"
                        >
                          Resolve
                        </button>
                        <button
                          type="button"
                          onclick={() => openRejectModal(item)}
                          class="rounded-md border border-destructive px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive hover:text-white"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<!-- Resolve Modal -->
{#if resolveItem}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
    <div class="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
      <h2 class="mb-1 text-base font-semibold">Resolve alias collision</h2>
      <p class="mb-4 text-sm text-muted-foreground">
        Attach <span class="font-medium text-foreground">"{resolveItem.rawName}"</span> to an existing identity.
      </p>

      {#if resolveItem.suggestedIdentityUserId}
        <p class="mb-3 text-xs text-status-active">
          A suggested identity is pre-selected. Confirm or pick a different one below.
        </p>
      {/if}

      {#if selectedIdentityName}
        <div class="mb-3 rounded-md border border-border bg-muted px-3 py-2 text-sm">
          Selected: <span class="font-medium text-foreground">{selectedIdentityName}</span>
          <button
            type="button"
            onclick={() => { selectedIdentityId = null; selectedIdentityName = null }}
            class="ml-2 text-xs text-muted-foreground hover:text-destructive"
          >clear</button>
        </div>
      {/if}

      <input
        type="text"
        placeholder="Search by name or email…"
        bind:value={resolveSearch}
        oninput={onSearchInput}
        class="mb-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
      />

      {#if resolveResults.length > 0}
        <ul class="mb-3 max-h-40 overflow-y-auto rounded-lg border border-border bg-background">
          {#each resolveResults.slice(0, 5) as user}
            <li>
              <button
                type="button"
                onclick={() => selectIdentity(user.id, user.name, user.email)}
                class="flex w-full flex-col px-3 py-2 text-left hover:bg-accent"
              >
                <span class="text-sm font-medium">{user.name}</span>
                <span class="text-xs text-muted-foreground">{user.email}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      {#if resolveError}
        <p class="mb-2 text-sm text-destructive">{resolveError}</p>
      {/if}
      {#if resolveSuccess}
        <p class="mb-2 text-sm text-status-active">{resolveSuccess}</p>
      {/if}

      <div class="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onclick={closeResolveModal}
          class="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={submitResolve}
          disabled={!selectedIdentityId || $resolveMutation.isPending}
          class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/80 disabled:opacity-50"
        >
          {$resolveMutation.isPending ? 'Resolving…' : 'Confirm Resolve'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Reject Modal -->
{#if rejectItem}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
    <div class="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
      <h2 class="mb-1 text-base font-semibold">Reject alias collision</h2>
      <p class="mb-4 text-sm text-muted-foreground">
        Reject <span class="font-medium text-foreground">"{rejectItem.rawName}"</span> — provide a reason for audit trail.
      </p>

      <textarea
        placeholder="Reason for rejection…"
        bind:value={rejectReason}
        rows={3}
        class="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
      ></textarea>

      {#if rejectError}
        <p class="mb-2 text-sm text-destructive">{rejectError}</p>
      {/if}
      {#if rejectSuccess}
        <p class="mb-2 text-sm text-status-active">{rejectSuccess}</p>
      {/if}

      <div class="flex justify-end gap-2">
        <button
          type="button"
          onclick={closeRejectModal}
          class="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={submitReject}
          disabled={!rejectReason.trim() || $rejectMutation.isPending}
          class="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-white hover:bg-destructive/80 disabled:opacity-50"
        >
          {$rejectMutation.isPending ? 'Rejecting…' : 'Confirm Reject'}
        </button>
      </div>
    </div>
  </div>
{/if}
