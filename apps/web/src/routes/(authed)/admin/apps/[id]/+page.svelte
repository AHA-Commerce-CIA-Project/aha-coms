<script lang="ts">
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { createQuery, useQueryClient } from '@tanstack/svelte-query'
  import { adminApi } from '$lib/admin-api'
  import type { WebhookEndpoint } from '$lib/admin-api'
  import {
    PORTAL_ADAPTER_TYPES,
    PORTAL_COMPLIANCE_STATUSES,
    PORTAL_HANDOFF_MODES,
    PORTAL_WEBHOOK_EVENTS,
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

  // ---------------------------------------------------------------------------
  // Webhook endpoints
  // ---------------------------------------------------------------------------

  const webhooksQuery = $derived(
    createQuery({
      queryKey: ['webhooks', id],
      queryFn: () => adminApi.listWebhooks(id),
    }),
  )

  // Register form state
  let newWebhookUrl = $state('')
  let newWebhookEvents = $state<string[]>([])
  let registerError = $state<string | null>(null)
  let registerPending = $state(false)

  // Revealed secret banner
  let revealedSecret = $state<string | null>(null)
  let secretCopied = $state(false)

  // Per-row state
  let confirmingDeleteWebhook = $state<string | null>(null)
  let pendingDeleteWebhook = $state<string | null>(null)
  let pendingToggleWebhook = $state<string | null>(null)
  let pendingRotateWebhook = $state<string | null>(null)
  let rotatedSecret = $state<{ id: string; secret: string } | null>(null)
  let rotatedCopied = $state(false)
  let pendingTestWebhook = $state<string | null>(null)
  let testResults = $state<Record<string, { delivered: boolean; status?: number; error?: string }>>({})
  let webhookActionError = $state<string | null>(null)

  function toggleEventSelection(event: string) {
    if (newWebhookEvents.includes(event)) {
      newWebhookEvents = newWebhookEvents.filter((e) => e !== event)
    } else {
      newWebhookEvents = [...newWebhookEvents, event]
    }
  }

  async function handleRegisterWebhook(e: SubmitEvent) {
    e.preventDefault()
    registerError = null
    if (newWebhookEvents.length === 0) {
      registerError = 'Select at least one event to subscribe to.'
      return
    }
    registerPending = true
    try {
      const result = await adminApi.createWebhook(id, {
        url: newWebhookUrl,
        subscribedEvents: newWebhookEvents,
      })
      revealedSecret = result.secret
      secretCopied = false
      newWebhookUrl = ''
      newWebhookEvents = []
      queryClient.invalidateQueries({ queryKey: ['webhooks', id] })
    } catch (err) {
      registerError = err instanceof Error ? err.message : 'Failed to register endpoint'
    } finally {
      registerPending = false
    }
  }

  async function handleToggleStatus(endpoint: WebhookEndpoint) {
    webhookActionError = null
    pendingToggleWebhook = endpoint.id
    const newStatus = endpoint.status === 'active' ? 'disabled' : 'active'
    try {
      await adminApi.updateWebhook(id, endpoint.id, { status: newStatus })
      queryClient.invalidateQueries({ queryKey: ['webhooks', id] })
    } catch (err) {
      webhookActionError = err instanceof Error ? err.message : 'Failed to update endpoint'
    } finally {
      pendingToggleWebhook = null
    }
  }

  async function handleRotateSecret(endpointId: string) {
    webhookActionError = null
    pendingRotateWebhook = endpointId
    try {
      const result = await adminApi.rotateWebhookSecret(id, endpointId)
      rotatedSecret = { id: endpointId, secret: result.secret }
      rotatedCopied = false
    } catch (err) {
      webhookActionError = err instanceof Error ? err.message : 'Failed to rotate secret'
    } finally {
      pendingRotateWebhook = null
    }
  }

  async function handleDeleteWebhook(endpointId: string) {
    webhookActionError = null
    pendingDeleteWebhook = endpointId
    try {
      await adminApi.deleteWebhook(id, endpointId)
      confirmingDeleteWebhook = null
      queryClient.invalidateQueries({ queryKey: ['webhooks', id] })
    } catch (err) {
      webhookActionError = err instanceof Error ? err.message : 'Failed to delete endpoint'
    } finally {
      pendingDeleteWebhook = null
    }
  }

  async function handleTestWebhook(endpointId: string) {
    webhookActionError = null
    pendingTestWebhook = endpointId
    try {
      const result = await adminApi.testWebhook(id, endpointId)
      testResults = { ...testResults, [endpointId]: result }
    } catch (err) {
      testResults = {
        ...testResults,
        [endpointId]: {
          delivered: false,
          error: err instanceof Error ? err.message : 'Request failed',
        },
      }
    } finally {
      pendingTestWebhook = null
    }
  }

  async function copyToClipboard(text: string, onCopied: () => void) {
    try {
      await navigator.clipboard.writeText(text)
      onCopied()
    } catch {
      // Clipboard API not available — silent failure
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

  <!-- ======================================================================
       Webhook endpoints section — always shown (independent of edit state)
       ====================================================================== -->
  <div class="mt-8 max-w-2xl">
    <h2 class="mb-3 text-sm font-semibold">Webhook Endpoints</h2>

    <!-- One-time secret banner -->
    {#if revealedSecret}
      <div class="mb-4 rounded-xl border border-yellow-700 bg-yellow-950 p-4 text-xs">
        <p class="mb-2 font-semibold text-yellow-300">Endpoint registered — save your secret now</p>
        <p class="mb-3 text-yellow-200">This secret will not be shown again. Copy it and store it securely.</p>
        <div class="flex items-center gap-2">
          <code class="flex-1 overflow-auto rounded bg-yellow-900 px-2 py-1 font-mono text-yellow-100 select-all">
            {revealedSecret}
          </code>
          <button
            onclick={() => copyToClipboard(revealedSecret!, () => { secretCopied = true })}
            class="rounded bg-yellow-700 px-3 py-1 text-xs font-medium text-yellow-100 hover:bg-yellow-600"
          >
            {secretCopied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <button
          onclick={() => { revealedSecret = null; secretCopied = false }}
          class="mt-3 text-xs text-yellow-400 hover:underline"
        >
          Dismiss
        </button>
      </div>
    {/if}

    <!-- Rotated secret banner -->
    {#if rotatedSecret}
      <div class="mb-4 rounded-xl border border-yellow-700 bg-yellow-950 p-4 text-xs">
        <p class="mb-2 font-semibold text-yellow-300">Secret rotated — save your new secret now</p>
        <p class="mb-3 text-yellow-200">The previous secret is now invalid. This will not be shown again.</p>
        <div class="flex items-center gap-2">
          <code class="flex-1 overflow-auto rounded bg-yellow-900 px-2 py-1 font-mono text-yellow-100 select-all">
            {rotatedSecret.secret}
          </code>
          <button
            onclick={() => copyToClipboard(rotatedSecret!.secret, () => { rotatedCopied = true })}
            class="rounded bg-yellow-700 px-3 py-1 text-xs font-medium text-yellow-100 hover:bg-yellow-600"
          >
            {rotatedCopied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <button
          onclick={() => { rotatedSecret = null; rotatedCopied = false }}
          class="mt-3 text-xs text-yellow-400 hover:underline"
        >
          Dismiss
        </button>
      </div>
    {/if}

    {#if webhookActionError}
      <p class="mb-3 text-xs text-red-400">{webhookActionError}</p>
    {/if}

    <!-- Endpoint list -->
    {#if $webhooksQuery.isLoading}
      <div class="animate-pulse h-16 rounded-xl bg-neutral-800"></div>
    {:else if $webhooksQuery.data && $webhooksQuery.data.length > 0}
      <div class="mb-4 space-y-2">
        {#each $webhooksQuery.data as endpoint}
          {@const testResult = testResults[endpoint.id]}
          <div class="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{endpoint.url}</p>
                <div class="mt-1 flex flex-wrap gap-1">
                  {#each endpoint.subscribedEvents as ev}
                    <span class="rounded bg-neutral-700 px-1.5 py-0.5 text-xs text-neutral-300">{ev}</span>
                  {/each}
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                  <span class:text-green-400={endpoint.status === 'active'} class:text-neutral-400={endpoint.status !== 'active'}>
                    {endpoint.status}
                  </span>
                  {#if endpoint.failureCount > 0}
                    <span class="text-red-400">{endpoint.failureCount} failure{endpoint.failureCount !== 1 ? 's' : ''}</span>
                  {/if}
                  {#if endpoint.lastDeliveredAt}
                    <span>Last delivered {new Date(endpoint.lastDeliveredAt).toLocaleString()}</span>
                  {/if}
                  {#if endpoint.lastFailureAt}
                    <span class="text-red-400" title={endpoint.lastFailureReason ?? ''}>
                      Last failed {new Date(endpoint.lastFailureAt).toLocaleString()}
                    </span>
                  {/if}
                </div>

                {#if testResult}
                  <div class="mt-2 rounded border px-2 py-1 text-xs {testResult.delivered ? 'border-green-800 bg-green-950 text-green-300' : 'border-red-800 bg-red-950 text-red-300'}">
                    {#if testResult.delivered}
                      Delivered — HTTP {testResult.status}
                    {:else}
                      Failed — {testResult.error ?? `HTTP ${testResult.status}`}
                    {/if}
                  </div>
                {/if}
              </div>

              <div class="flex shrink-0 flex-wrap gap-1.5">
                <button
                  onclick={() => handleTestWebhook(endpoint.id)}
                  disabled={pendingTestWebhook === endpoint.id}
                  class="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50"
                >
                  {pendingTestWebhook === endpoint.id ? 'Sending…' : 'Test'}
                </button>

                <button
                  onclick={() => handleToggleStatus(endpoint)}
                  disabled={pendingToggleWebhook === endpoint.id}
                  class="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50"
                >
                  {#if pendingToggleWebhook === endpoint.id}
                    Updating…
                  {:else if endpoint.status === 'active'}
                    Disable
                  {:else}
                    Enable
                  {/if}
                </button>

                <button
                  onclick={() => handleRotateSecret(endpoint.id)}
                  disabled={pendingRotateWebhook === endpoint.id}
                  class="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50"
                >
                  {pendingRotateWebhook === endpoint.id ? 'Rotating…' : 'Rotate secret'}
                </button>

                {#if confirmingDeleteWebhook === endpoint.id}
                  <button
                    onclick={() => handleDeleteWebhook(endpoint.id)}
                    disabled={pendingDeleteWebhook === endpoint.id}
                    class="rounded border border-red-800 px-2 py-1 text-xs text-red-400 hover:bg-red-950 disabled:opacity-50"
                  >
                    {pendingDeleteWebhook === endpoint.id ? 'Deleting…' : 'Confirm delete'}
                  </button>
                  <button
                    onclick={() => { confirmingDeleteWebhook = null; webhookActionError = null }}
                    class="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                  >
                    Cancel
                  </button>
                {:else}
                  <button
                    onclick={() => { confirmingDeleteWebhook = endpoint.id; webhookActionError = null }}
                    class="rounded border border-red-800 px-2 py-1 text-xs text-red-400 hover:bg-red-950"
                  >
                    Delete
                  </button>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else if !$webhooksQuery.isLoading}
      <p class="mb-4 text-xs text-neutral-500">No webhook endpoints registered.</p>
    {/if}

    <!-- Register endpoint form -->
    <div class="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <h3 class="mb-4 text-xs font-semibold text-neutral-300">Register Endpoint</h3>
      <form onsubmit={handleRegisterWebhook} class="space-y-3">
        <div>
          <label for="wh-url" class="mb-1 block text-xs text-neutral-400">URL</label>
          <input
            id="wh-url"
            type="url"
            bind:value={newWebhookUrl}
            required
            placeholder="https://your-app.example.com/webhook"
            class="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <p class="mt-1 text-xs text-neutral-500">https:// required (http://localhost allowed for dev)</p>
        </div>

        <div>
          <p class="mb-2 text-xs text-neutral-400">Subscribe to events</p>
          <div class="grid grid-cols-2 gap-1.5">
            {#each PORTAL_WEBHOOK_EVENTS as ev}
              <label class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-neutral-800">
                <input
                  type="checkbox"
                  checked={newWebhookEvents.includes(ev)}
                  onchange={() => toggleEventSelection(ev)}
                  class="accent-indigo-500"
                />
                <span class="text-xs">{ev}</span>
              </label>
            {/each}
          </div>
        </div>

        {#if registerError}
          <p class="text-xs text-red-400">{registerError}</p>
        {/if}

        <button
          type="submit"
          disabled={registerPending}
          class="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          {registerPending ? 'Registering…' : 'Register endpoint'}
        </button>
      </form>
    </div>
  </div>

  <a href="/admin/apps" class="mt-6 inline-block text-xs text-indigo-400 hover:text-indigo-300">&larr; Back to apps</a>
</div>
