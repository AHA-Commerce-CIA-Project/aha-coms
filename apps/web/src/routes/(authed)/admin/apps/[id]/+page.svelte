<script lang="ts">
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { createQuery, useQueryClient } from '@tanstack/svelte-query'
  import { adminApi } from '$lib/admin-api'
  import {
    PORTAL_ADAPTER_TYPES,
    PORTAL_COMPLIANCE_STATUSES,
    PORTAL_HANDOFF_MODES,
    type PortalAdapterType,
    type PortalComplianceStatus,
    type PortalHandoffMode,
  } from '@coms-portal/shared'

  const id = $derived($page.params.id!)

  const query = $derived(
    createQuery({
      queryKey: ['apps', id],
      queryFn: () => adminApi.getApp(id),
    })
  )

  const queryClient = useQueryClient()

  let editing = $state(false)
  let editName = $state('')
  let editUrl = $state('')
  let editBasePath = $state('')
  let editAdapterType = $state<PortalAdapterType>('server_middleware')
  let editTransportMode = $state<'same_host_cookie' | 'portable_token'>('portable_token')
  let editHandoffMode = $state<PortalHandoffMode>('one_time_code')
  let editBrokerOrigin = $state('')
  let editContractVersion = $state(1)
  let editComplianceStatus = $state<PortalComplianceStatus>('draft')
  let editManifestPath = $state('')
  let editStatus = $state('active')
  let editError = $state<string | null>(null)
  let editPending = $state(false)
  let deleteError = $state<string | null>(null)
  let deletePending = $state(false)
  let confirmingDelete = $state(false)

  function startEdit() {
    const app = $query.data
    if (!app) return
    editName = app.name
    editUrl = app.url
    editBasePath = app.basePath ?? ''
    editAdapterType = app.adapterType
    editTransportMode = app.transportMode
    editHandoffMode = app.handoffMode
    editBrokerOrigin = app.brokerOrigin ?? ''
    editContractVersion = app.contractVersion
    editComplianceStatus = app.complianceStatus
    editManifestPath = app.manifestPath ?? ''
    editStatus = app.status
    editError = null
    editing = true
  }

  async function handleSaveEdit(e: SubmitEvent) {
    e.preventDefault()
    editError = null
    editPending = true
    try {
      await adminApi.updateApp(id, {
        name: editName,
        url: editUrl,
        basePath: editBasePath || undefined,
        adapterType: editAdapterType,
        transportMode: editTransportMode,
        handoffMode: editHandoffMode,
        brokerOrigin: editTransportMode === 'portable_token' ? editBrokerOrigin || undefined : undefined,
        contractVersion: editContractVersion,
        complianceStatus: editComplianceStatus,
        manifestPath: editManifestPath || undefined,
        status: editStatus as 'active' | 'maintenance' | 'deprecated',
      })
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
    deleteError = null
    deletePending = true

    try {
      await adminApi.deleteApp(id)
      await queryClient.invalidateQueries({ queryKey: ['apps'] })
      await goto('/admin/apps')
    } catch (error) {
      deleteError = error instanceof Error ? error.message : 'Failed to delete app'
    } finally {
      deletePending = false
    }
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
                <option value="maintenance">Maintenance</option>
                <option value="deprecated">Deprecated</option>
              </select>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label for="app-adapter-type" class="mb-1 block text-xs text-neutral-400">Adapter Type</label>
                <select
                  id="app-adapter-type"
                  bind:value={editAdapterType}
                  class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  {#each PORTAL_ADAPTER_TYPES as adapterType}
                    <option value={adapterType}>{adapterType}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label for="app-transport-mode" class="mb-1 block text-xs text-neutral-400">Transport</label>
                <select
                  id="app-transport-mode"
                  bind:value={editTransportMode}
                  class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="portable_token">portal-brokered token</option>
                  <option value="same_host_cookie">same-host cookie</option>
                </select>
              </div>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label for="app-handoff-mode" class="mb-1 block text-xs text-neutral-400">Handoff Mode</label>
                <select
                  id="app-handoff-mode"
                  bind:value={editHandoffMode}
                  class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  {#each PORTAL_HANDOFF_MODES as handoffMode}
                    <option value={handoffMode}>{handoffMode}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label for="app-compliance-status" class="mb-1 block text-xs text-neutral-400">Compliance</label>
                <select
                  id="app-compliance-status"
                  bind:value={editComplianceStatus}
                  class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  {#each PORTAL_COMPLIANCE_STATUSES as complianceStatus}
                    <option value={complianceStatus}>{complianceStatus}</option>
                  {/each}
                </select>
              </div>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label for="app-broker-origin" class="mb-1 block text-xs text-neutral-400">Broker Origin</label>
                <input
                  id="app-broker-origin"
                  type="url"
                  bind:value={editBrokerOrigin}
                  disabled={editTransportMode !== 'portable_token'}
                  class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label for="app-manifest-path" class="mb-1 block text-xs text-neutral-400">Manifest Path</label>
                <input
                  id="app-manifest-path"
                  type="text"
                  bind:value={editManifestPath}
                  class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
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
          {#if confirmingDelete}
            <button
              onclick={handleDelete}
              disabled={deletePending}
              class="rounded-lg border border-red-800 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950 disabled:opacity-50"
            >
              {deletePending ? 'Deleting…' : 'Confirm Delete'}
            </button>
            <button
              onclick={() => {
                confirmingDelete = false
                deleteError = null
              }}
              class="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-800"
            >
              Cancel
            </button>
          {:else}
            <button
              onclick={() => {
                confirmingDelete = true
                deleteError = null
              }}
              class="rounded-lg border border-red-800 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950"
            >
              Delete
            </button>
          {/if}
        </div>
      {/if}
    </div>

    {#if deleteError}
      <p class="mb-4 text-sm text-red-400">{deleteError}</p>
    {/if}

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
        <div class="flex justify-between border-b border-neutral-800 pb-2">
          <span class="text-xs text-neutral-400">Adapter Type</span>
          <span class="text-sm">{app.adapterType}</span>
        </div>
        <div class="flex justify-between border-b border-neutral-800 pb-2">
          <span class="text-xs text-neutral-400">Transport</span>
          <span class="text-sm">{app.transportMode}</span>
        </div>
        <div class="flex justify-between border-b border-neutral-800 pb-2">
          <span class="text-xs text-neutral-400">Handoff</span>
          <span class="text-sm">{app.handoffMode}</span>
        </div>
        <div class="flex justify-between border-b border-neutral-800 pb-2">
          <span class="text-xs text-neutral-400">Broker Origin</span>
          <span class="text-sm">{app.brokerOrigin ?? '-'}</span>
        </div>
        <div class="flex justify-between border-b border-neutral-800 pb-2">
          <span class="text-xs text-neutral-400">Contract Version</span>
          <span class="text-sm">{app.contractVersion}</span>
        </div>
        <div class="flex justify-between border-b border-neutral-800 pb-2">
          <span class="text-xs text-neutral-400">Compliance</span>
          <span class="text-sm">{app.complianceStatus}</span>
        </div>
        <div class="flex justify-between border-b border-neutral-800 pb-2">
          <span class="text-xs text-neutral-400">Manifest Path</span>
          <span class="text-sm">{app.manifestPath ?? '-'}</span>
        </div>
        <div class="flex justify-between border-b border-neutral-800 pb-2">
          <span class="text-xs text-neutral-400">Last Verified</span>
          <span class="text-sm">{app.lastVerifiedAt ?? '-'}</span>
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
