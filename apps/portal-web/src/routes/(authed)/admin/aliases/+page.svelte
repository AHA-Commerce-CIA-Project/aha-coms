<script lang="ts">
  import { createAliasQueueQuery, createResolveAliasMutation, createRejectAliasMutation } from '$lib/queries/aliases'
  import { adminApi } from '$lib/admin-api'
  import type { AliasQueueItem } from '$lib/admin-api'
  import {
    Button,
    Input,
    Textarea,
    Card,
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from '@coms-portal/ui-svelte/primitives'

  const query = createAliasQueueQuery()
  const resolveMutation = createResolveAliasMutation()
  const rejectMutation = createRejectAliasMutation()

  // Resolve modal state
  let resolveItem = $state<AliasQueueItem | null>(null)
  let resolveOpen = $state(false)
  let resolveSearch = $state('')
  let resolveResults = $state<Array<{ id: string; name: string; email: string }>>([])
  let selectedIdentityId = $state<string | null>(null)
  let selectedIdentityName = $state<string | null>(null)
  let resolveError = $state<string | null>(null)
  let resolveSuccess = $state<string | null>(null)
  let searchDebounce = $state<ReturnType<typeof setTimeout> | null>(null)

  // Reject modal state
  let rejectItem = $state<AliasQueueItem | null>(null)
  let rejectOpen = $state(false)
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
    resolveOpen = true
  }

  function closeResolveModal() {
    resolveOpen = false
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
    rejectOpen = true
  }

  function closeRejectModal() {
    rejectOpen = false
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
          <Card>
            <div class="border-b border-border px-4 py-3">
              <span class="font-medium">"{group.rawNameNormalized}"</span>
              <span class="ml-2 text-sm text-muted-foreground">
                — {group.count} pending, oldest {formatRelativeDate(group.oldestAt)}
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Raw Name</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {#each group.items as item}
                  <TableRow>
                    <TableCell class="font-medium">{item.rawName}</TableCell>
                    <TableCell class="text-muted-foreground">{item.source}</TableCell>
                    <TableCell class="text-muted-foreground text-xs">
                      {Object.keys(item.context).length > 0 ? JSON.stringify(item.context) : '—'}
                    </TableCell>
                    <TableCell class="text-muted-foreground">{formatRelativeDate(item.createdAt)}</TableCell>
                    <TableCell>
                      <div class="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onclick={() => openResolveModal(item)}
                        >
                          Resolve
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onclick={() => openRejectModal(item)}
                        >
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                {/each}
              </TableBody>
            </Table>
          </Card>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<!-- Resolve Modal -->
<Dialog bind:open={resolveOpen}>
  <DialogContent class="max-w-md">
    <DialogHeader>
      <DialogTitle>Resolve alias collision</DialogTitle>
      <DialogDescription>
        Attach <span class="font-medium text-foreground">"{resolveItem?.rawName}"</span> to an existing identity.
      </DialogDescription>
    </DialogHeader>

    {#if resolveItem?.suggestedIdentityUserId}
      <p class="text-xs text-status-active">
        A suggested identity is pre-selected. Confirm or pick a different one below.
      </p>
    {/if}

    {#if selectedIdentityName}
      <div class="rounded-md border border-border bg-muted px-3 py-2 text-sm">
        Selected: <span class="font-medium text-foreground">{selectedIdentityName}</span>
        <button
          type="button"
          onclick={() => { selectedIdentityId = null; selectedIdentityName = null }}
          class="ml-2 text-xs text-muted-foreground hover:text-destructive"
        >clear</button>
      </div>
    {/if}

    <Input
      type="text"
      placeholder="Search by name or email…"
      bind:value={resolveSearch}
      oninput={onSearchInput}
      class="w-full"
    />

    {#if resolveResults.length > 0}
      <ul class="max-h-40 overflow-y-auto rounded-lg border border-border bg-background">
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
      <p class="text-sm text-destructive">{resolveError}</p>
    {/if}
    {#if resolveSuccess}
      <p class="text-sm text-status-active">{resolveSuccess}</p>
    {/if}

    <DialogFooter>
      <Button type="button" variant="outline" onclick={closeResolveModal}>Cancel</Button>
      <Button
        type="button"
        onclick={submitResolve}
        disabled={!selectedIdentityId || $resolveMutation.isPending}
      >
        {$resolveMutation.isPending ? 'Resolving…' : 'Confirm Resolve'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

<!-- Reject Modal -->
<Dialog bind:open={rejectOpen}>
  <DialogContent class="max-w-md">
    <DialogHeader>
      <DialogTitle>Reject alias collision</DialogTitle>
      <DialogDescription>
        Reject <span class="font-medium text-foreground">"{rejectItem?.rawName}"</span> — provide a reason for audit trail.
      </DialogDescription>
    </DialogHeader>

    <Textarea
      placeholder="Reason for rejection…"
      bind:value={rejectReason}
      rows={3}
      class="w-full"
    />

    {#if rejectError}
      <p class="text-sm text-destructive">{rejectError}</p>
    {/if}
    {#if rejectSuccess}
      <p class="text-sm text-status-active">{rejectSuccess}</p>
    {/if}

    <DialogFooter>
      <Button type="button" variant="outline" onclick={closeRejectModal}>Cancel</Button>
      <Button
        type="button"
        variant="destructive"
        onclick={submitReject}
        disabled={!rejectReason.trim() || $rejectMutation.isPending}
      >
        {$rejectMutation.isPending ? 'Rejecting…' : 'Confirm Reject'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
