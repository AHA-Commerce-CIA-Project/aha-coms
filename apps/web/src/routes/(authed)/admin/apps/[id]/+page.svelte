<script lang="ts">
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { createQuery, useQueryClient } from '@tanstack/svelte-query'
  import { api } from '$lib/api'

  const id = $derived($page.params.id!)

  const query = $derived(
    createQuery({
      queryKey: ['apps', id],
      queryFn: async () => {
        const { data, error } = await (api.api.v1.apps as any)[id].get()
        if (error) throw error
        return data
      },
    })
  )

  const queryClient = useQueryClient()

  let editing = $state(false)
  let editName = $state('')
  let editUrl = $state('')
  let editBasePath = $state('')
  let editStatus = $state('active')
  let editError = $state<string | null>(null)
  let editPending = $state(false)

  function startEdit() {
    const app = $query.data
    if (!app) return
    editName = app.name
    editUrl = app.url
    editBasePath = app.basePath ?? ''
    editStatus = app.status
    editError = null
    editing = true
  }

  async function handleSaveEdit(e: SubmitEvent) {
    e.preventDefault()
    editError = null
    editPending = true
    try {
      const { error } = await (api.api.v1.apps as any)[id].patch({
        name: editName,
        url: editUrl,
        basePath: editBasePath || undefined,
        status: editStatus,
      })
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['apps', id] })
      queryClient.invalidateQueries({ queryKey: ['apps'] })
      editing = false
    } catch (e) {
      editError = e instanceof Error ? e.message : 'Failed to update app'
    } finally {
      editPending = false
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this app? This cannot be undone.')) return
    const { error } = await (api.api.v1.apps as any)[id].delete()
    if (error) { alert('Failed to delete app'); return }
    queryClient.invalidateQueries({ queryKey: ['apps'] })
    await goto('/admin/apps')
  }
</script>

<div class="p-8">
  {#if $query.isLoading}
    <div class="animate-pulse space-y-4">
      <div class="h-8 w-48 rounded bg-neutral-800"></div>
      <div class="h-48 rounded-xl bg-neutral-800"></div>
    </div>
  {:else if $query.data}
    {@const app = $query.data}

    <div class="mb-6 flex items-start justify-between">
      <div>
        {#if editing}
          <form onsubmit={handleSaveEdit} class="space-y-3">
            <div>
              <label for="app-name" class="mb-1 block text-xs text-neutral-400">Name</label>
              <input
                id="app-name"
                type="text"
                bind:value={editName}
                required
                class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label for="app-url" class="mb-1 block text-xs text-neutral-400">URL</label>
              <input
                id="app-url"
                type="url"
                bind:value={editUrl}
                required
                class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label for="app-base-path" class="mb-1 block text-xs text-neutral-400">Base Path</label>
              <input
                id="app-base-path"
                type="text"
                bind:value={editBasePath}
                placeholder="e.g. /app"
                class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label for="app-status" class="mb-1 block text-xs text-neutral-400">Status</label>
              <select
                id="app-status"
                bind:value={editStatus}
                class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            {#if editError}
              <p class="text-xs text-red-400">{editError}</p>
            {/if}
            <div class="flex gap-2">
              <button type="submit" disabled={editPending} class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50">Save</button>
              <button type="button" onclick={() => editing = false} class="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-800">Cancel</button>
            </div>
          </form>
        {:else}
          <h1 class="text-xl font-semibold">{app.name}</h1>
          <p class="text-sm text-neutral-400">{app.slug}</p>
        {/if}
      </div>
      {#if !editing}
        <div class="flex gap-2">
          <button onclick={startEdit} class="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-800">Edit</button>
          <button onclick={handleDelete} class="rounded-lg border border-red-800 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950">Delete</button>
        </div>
      {/if}
    </div>

    {#if !editing}
      <div class="max-w-lg space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div class="flex justify-between border-b border-neutral-800 pb-2">
          <span class="text-xs text-neutral-400">Slug</span>
          <span class="text-sm">{app.slug}</span>
        </div>
        <div class="flex justify-between border-b border-neutral-800 pb-2">
          <span class="text-xs text-neutral-400">URL</span>
          <a href={app.url} target="_blank" class="text-sm text-indigo-400 hover:text-indigo-300">{app.url}</a>
        </div>
        <div class="flex justify-between border-b border-neutral-800 pb-2">
          <span class="text-xs text-neutral-400">Base Path</span>
          <span class="text-sm">{app.basePath ?? '-'}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-xs text-neutral-400">Status</span>
          <span class="text-sm" class:text-green-400={app.status === 'active'} class:text-red-400={app.status !== 'active'}>{app.status}</span>
        </div>
      </div>

      <!-- Team grants -->
      {#if app.teamGrants && app.teamGrants.length > 0}
        <div class="mt-6 max-w-lg">
          <h2 class="mb-3 text-sm font-semibold">Teams with Access</h2>
          <div class="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-1">
            {#each app.teamGrants as grant}
              <div class="flex items-center justify-between py-1">
                <a href="/admin/teams/{grant.teamId}" class="text-sm text-indigo-400 hover:text-indigo-300">{grant.teamName ?? grant.teamId}</a>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  {:else if $query.error}
    <p class="text-sm text-red-400">Failed to load app.</p>
  {/if}

  <a href="/admin/apps" class="mt-6 inline-block text-xs text-indigo-400 hover:text-indigo-300">&larr; Back to apps</a>
</div>
