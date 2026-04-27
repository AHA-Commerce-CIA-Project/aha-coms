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
  let editServiceAccountEmail = $state('')
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
    editServiceAccountEmail = app.serviceAccountEmail ?? ''
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
        serviceAccountEmail: editServiceAccountEmail || undefined,
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
      <div class="h-8 w-48 rounded bg-muted"></div>
      <div class="h-48 rounded-xl bg-muted"></div>
    </div>
  {:else if $query.data}
    {@const app = $query.data}

    <div class="mb-6 flex items-start justify-between">
      <div>
        {#if editing}
          <form onsubmit={handleSaveEdit} class="space-y-3">
            <div>
              <label for="app-name" class="mb-1 block text-xs text-muted-foreground">Name</label>
              <input
                id="app-name"
                type="text"
                bind:value={editName}
                required
                class="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none"
              />
            </div>
            <div>
              <label for="app-url" class="mb-1 block text-xs text-muted-foreground">URL</label>
              <input
                id="app-url"
                type="url"
                bind:value={editUrl}
                required
                class="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none"
              />
            </div>
            <div>
              <label for="app-base-path" class="mb-1 block text-xs text-muted-foreground">Base Path</label>
              <input
                id="app-base-path"
                type="text"
                bind:value={editBasePath}
                placeholder="e.g. /app"
                class="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none"
              />
            </div>
            <div>
              <label for="app-status" class="mb-1 block text-xs text-muted-foreground">Status</label>
              <select
                id="app-status"
                bind:value={editStatus}
                class="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="deprecated">Deprecated</option>
              </select>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label for="app-adapter-type" class="mb-1 block text-xs text-muted-foreground">Adapter Type</label>
                <select
                  id="app-adapter-type"
                  bind:value={editAdapterType}
                  class="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none"
                >
                  {#each PORTAL_ADAPTER_TYPES as adapterType}
                    <option value={adapterType}>{adapterType}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label for="app-transport-mode" class="mb-1 block text-xs text-muted-foreground">Transport</label>
                <select
                  id="app-transport-mode"
                  bind:value={editTransportMode}
                  class="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none"
                >
                  <option value="portable_token">portal-brokered token</option>
                  <option value="same_host_cookie">same-host cookie</option>
                </select>
              </div>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label for="app-handoff-mode" class="mb-1 block text-xs text-muted-foreground">Handoff Mode</label>
                <select
                  id="app-handoff-mode"
                  bind:value={editHandoffMode}
                  class="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none"
                >
                  {#each PORTAL_HANDOFF_MODES as handoffMode}
                    <option value={handoffMode}>{handoffMode}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label for="app-compliance-status" class="mb-1 block text-xs text-muted-foreground">Compliance</label>
                <select
                  id="app-compliance-status"
                  bind:value={editComplianceStatus}
                  class="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none"
                >
                  {#each PORTAL_COMPLIANCE_STATUSES as complianceStatus}
                    <option value={complianceStatus}>{complianceStatus}</option>
                  {/each}
                </select>
              </div>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label for="app-broker-origin" class="mb-1 block text-xs text-muted-foreground">Broker Origin</label>
                <input
                  id="app-broker-origin"
                  type="url"
                  bind:value={editBrokerOrigin}
                  disabled={editTransportMode !== 'portable_token'}
                  class="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label for="app-manifest-path" class="mb-1 block text-xs text-muted-foreground">Manifest Path</label>
                <input
                  id="app-manifest-path"
                  type="text"
                  bind:value={editManifestPath}
                  class="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label for="app-sa-email" class="mb-1 block text-xs text-muted-foreground">Service Account Email (Google OIDC caller identity)</label>
              <input
                id="app-sa-email"
                type="email"
                bind:value={editServiceAccountEmail}
                placeholder="service-account@project.iam.gserviceaccount.com"
                class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none"
              />
              <p class="mt-1 text-xs text-muted-foreground">Google service account email of this app's Cloud Run runtime — used to authenticate the app when it calls portal endpoints (introspect) via OIDC. Leave blank to require legacy secret auth.</p>
            </div>
            {#if editError}
              <p class="text-xs text-destructive">{editError}</p>
            {/if}
            <div class="flex gap-2">
              <button type="submit" disabled={editPending} class="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50">Save</button>
              <button type="button" onclick={() => editing = false} class="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent">Cancel</button>
            </div>
          </form>
        {:else}
          <h1 class="text-xl font-semibold">{app.name}</h1>
          <p class="text-sm text-muted-foreground">{app.slug}</p>
        {/if}
      </div>
      {#if !editing}
        <div class="flex gap-2">
          <button onclick={startEdit} class="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent">Edit</button>
          {#if confirmingDelete}
            <button
              onclick={handleDelete}
              disabled={deletePending}
              class="rounded-lg border border-destructive/50 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              {deletePending ? 'Deleting…' : 'Confirm Delete'}
            </button>
            <button
              onclick={() => {
                confirmingDelete = false
                deleteError = null
              }}
              class="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent"
            >
              Cancel
            </button>
          {:else}
            <button
              onclick={() => {
                confirmingDelete = true
                deleteError = null
              }}
              class="rounded-lg border border-destructive/50 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
            >
              Delete
            </button>
          {/if}
        </div>
      {/if}
    </div>

    {#if deleteError}
      <p class="mb-4 text-sm text-destructive">{deleteError}</p>
    {/if}

    {#if !editing}
      <div class="max-w-lg space-y-3 rounded-xl border border-border bg-card p-6">
        <div class="flex justify-between border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Slug</span>
          <span class="text-sm">{app.slug}</span>
        </div>
        <div class="flex justify-between border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">URL</span>
          <a href={app.url} target="_blank" class="text-sm text-primary hover:text-primary/80">{app.url}</a>
        </div>
        <div class="flex justify-between border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Base Path</span>
          <span class="text-sm">{app.basePath ?? '-'}</span>
        </div>
        <div class="flex justify-between border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Adapter Type</span>
          <span class="text-sm">{app.adapterType}</span>
        </div>
        <div class="flex justify-between border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Transport</span>
          <span class="text-sm">{app.transportMode}</span>
        </div>
        <div class="flex justify-between border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Handoff</span>
          <span class="text-sm">{app.handoffMode}</span>
        </div>
        <div class="flex justify-between border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Broker Origin</span>
          <span class="text-sm">{app.brokerOrigin ?? '-'}</span>
        </div>
        <div class="flex justify-between border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Contract Version</span>
          <span class="text-sm">{app.contractVersion}</span>
        </div>
        <div class="flex justify-between border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Compliance</span>
          <span class="text-sm">{app.complianceStatus}</span>
        </div>
        <div class="flex justify-between border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Manifest Path</span>
          <span class="text-sm">{app.manifestPath ?? '-'}</span>
        </div>
        <div class="flex justify-between border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Service Account Email</span>
          <span class="text-sm font-mono">{app.serviceAccountEmail ?? '-'}</span>
        </div>
        <div class="flex justify-between border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Last Verified</span>
          <span class="text-sm">{app.lastVerifiedAt ?? '-'}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-xs text-muted-foreground">Status</span>
          <span class="text-sm" class:text-status-active={app.status === 'active'} class:text-destructive={app.status !== 'active'}>{app.status}</span>
        </div>
      </div>

      <!-- Team grants -->
      {#if app.teamGrants && app.teamGrants.length > 0}
        <div class="mt-6 max-w-lg">
          <h2 class="mb-3 text-sm font-semibold">Teams with Access</h2>
          <div class="rounded-xl border border-border bg-card p-4 space-y-1">
            {#each app.teamGrants as grant}
              <div class="flex items-center justify-between py-1">
                <a href="/admin/teams/{grant.teamId}" class="text-sm text-primary hover:text-primary/80">{grant.teamName ?? grant.teamId}</a>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  {:else if $query.error}
    <p class="text-sm text-destructive">Failed to load app.</p>
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
      <p class="mb-3 text-xs text-destructive">{webhookActionError}</p>
    {/if}

    <!-- Endpoint list -->
    {#if $webhooksQuery.isLoading}
      <div class="animate-pulse h-16 rounded-xl bg-muted"></div>
    {:else if $webhooksQuery.data && $webhooksQuery.data.length > 0}
      <div class="mb-4 space-y-2">
        {#each $webhooksQuery.data as endpoint}
          {@const testResult = testResults[endpoint.id]}
          <div class="rounded-xl border border-border bg-card p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{endpoint.url}</p>
                <div class="mt-1 flex flex-wrap gap-1">
                  {#each endpoint.subscribedEvents as ev}
                    <span class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{ev}</span>
                  {/each}
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span class:text-status-active={endpoint.status === 'active'} class:text-muted-foreground={endpoint.status !== 'active'}>
                    {endpoint.status}
                  </span>
                  {#if endpoint.failureCount > 0}
                    <span class="text-destructive">{endpoint.failureCount} failure{endpoint.failureCount !== 1 ? 's' : ''}</span>
                  {/if}
                  {#if endpoint.lastDeliveredAt}
                    <span>Last delivered {new Date(endpoint.lastDeliveredAt).toLocaleString()}</span>
                  {/if}
                  {#if endpoint.lastFailureAt}
                    <span class="text-destructive" title={endpoint.lastFailureReason ?? ''}>
                      Last failed {new Date(endpoint.lastFailureAt).toLocaleString()}
                    </span>
                  {/if}
                </div>

                {#if testResult}
                  <div class="mt-2 rounded border px-2 py-1 text-xs {testResult.delivered ? 'border-status-active/30 bg-status-active/10 text-status-active' : 'border-destructive/30 bg-destructive/10 text-destructive'}">
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
                  class="rounded border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                >
                  {pendingTestWebhook === endpoint.id ? 'Sending…' : 'Test'}
                </button>

                <button
                  onclick={() => handleToggleStatus(endpoint)}
                  disabled={pendingToggleWebhook === endpoint.id}
                  class="rounded border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
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
                  class="rounded border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                >
                  {pendingRotateWebhook === endpoint.id ? 'Rotating…' : 'Rotate secret'}
                </button>

                {#if confirmingDeleteWebhook === endpoint.id}
                  <button
                    onclick={() => handleDeleteWebhook(endpoint.id)}
                    disabled={pendingDeleteWebhook === endpoint.id}
                    class="rounded border border-destructive/50 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    {pendingDeleteWebhook === endpoint.id ? 'Deleting…' : 'Confirm delete'}
                  </button>
                  <button
                    onclick={() => { confirmingDeleteWebhook = null; webhookActionError = null }}
                    class="rounded border border-border px-2 py-1 text-xs hover:bg-accent"
                  >
                    Cancel
                  </button>
                {:else}
                  <button
                    onclick={() => { confirmingDeleteWebhook = endpoint.id; webhookActionError = null }}
                    class="rounded border border-destructive/50 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
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
      <p class="mb-4 text-xs text-muted-foreground">No webhook endpoints registered.</p>
    {/if}

    <!-- Register endpoint form -->
    <div class="rounded-xl border border-border bg-card p-5">
      <h3 class="mb-4 text-xs font-semibold text-muted-foreground">Register Endpoint</h3>
      <form onsubmit={handleRegisterWebhook} class="space-y-3">
        <div>
          <label for="wh-url" class="mb-1 block text-xs text-muted-foreground">URL</label>
          <input
            id="wh-url"
            type="url"
            bind:value={newWebhookUrl}
            required
            placeholder="https://your-app.example.com/webhook"
            class="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
          <p class="mt-1 text-xs text-muted-foreground">https:// required (http://localhost allowed for dev)</p>
        </div>

        <div>
          <p class="mb-2 text-xs text-muted-foreground">Subscribe to events</p>
          <div class="grid grid-cols-2 gap-1.5">
            {#each PORTAL_WEBHOOK_EVENTS as ev}
              <label class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent">
                <input
                  type="checkbox"
                  checked={newWebhookEvents.includes(ev)}
                  onchange={() => toggleEventSelection(ev)}
                  class="accent-primary"
                />
                <span class="text-xs">{ev}</span>
              </label>
            {/each}
          </div>
        </div>

        {#if registerError}
          <p class="text-xs text-destructive">{registerError}</p>
        {/if}

        <button
          type="submit"
          disabled={registerPending}
          class="rounded-lg bg-primary text-primary-foreground px-4 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {registerPending ? 'Registering…' : 'Register endpoint'}
        </button>
      </form>
    </div>
  </div>

  <a href="/admin/apps" class="mt-6 inline-block text-xs text-primary hover:text-primary/80">&larr; Back to apps</a>
</div>
