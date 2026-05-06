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
  import {
    Button,
    Input,
    Label,
    Badge,
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
  } from '@coms-portal/ui/primitives'

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
    try {
      if (endpoint.status === 'active') {
        await adminApi.updateWebhook(id, endpoint.id, { status: 'disabled' })
      } else {
        // Re-enable via the dedicated reactivate route — clears stale
        // failureCount / lastFailureAt / lastFailureReason and audits
        // separately from generic status PATCHes.
        await adminApi.reactivateWebhook(id, endpoint.id)
      }
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
              <Label for="app-name" class="mb-1 block text-xs text-muted-foreground">Name</Label>
              <Input
                id="app-name"
                type="text"
                bind:value={editName}
                required
              />
            </div>
            <div>
              <Label for="app-url" class="mb-1 block text-xs text-muted-foreground">URL</Label>
              <Input
                id="app-url"
                type="url"
                bind:value={editUrl}
                required
              />
            </div>
            <div>
              <Label for="app-base-path" class="mb-1 block text-xs text-muted-foreground">Base Path</Label>
              <Input
                id="app-base-path"
                type="text"
                bind:value={editBasePath}
                placeholder="e.g. /app"
              />
            </div>
            <div>
              <Label class="mb-1 block text-xs text-muted-foreground">Status</Label>
              <Select
                type="single"
                value={editStatus}
                onValueChange={(v) => { if (v) editStatus = v }}
              >
                <SelectTrigger class="w-full">
                  <span>{editStatus}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active" label="Active" />
                  <SelectItem value="maintenance" label="Maintenance" />
                  <SelectItem value="deprecated" label="Deprecated" />
                </SelectContent>
              </Select>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <Label class="mb-1 block text-xs text-muted-foreground">Adapter Type</Label>
                <Select
                  type="single"
                  value={editAdapterType}
                  onValueChange={(v) => { if (v) editAdapterType = v as PortalAdapterType }}
                >
                  <SelectTrigger class="w-full">
                    <span>{editAdapterType}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {#each PORTAL_ADAPTER_TYPES as adapterType}
                      <SelectItem value={adapterType} label={adapterType} />
                    {/each}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label class="mb-1 block text-xs text-muted-foreground">Transport</Label>
                <Select
                  type="single"
                  value={editTransportMode}
                  onValueChange={(v) => { if (v) editTransportMode = v as 'same_host_cookie' | 'portable_token' }}
                >
                  <SelectTrigger class="w-full">
                    <span>{editTransportMode === 'portable_token' ? 'portal-brokered token' : 'same-host cookie'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portable_token" label="portal-brokered token" />
                    <SelectItem value="same_host_cookie" label="same-host cookie" />
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <Label class="mb-1 block text-xs text-muted-foreground">Handoff Mode</Label>
                <Select
                  type="single"
                  value={editHandoffMode}
                  onValueChange={(v) => { if (v) editHandoffMode = v as PortalHandoffMode }}
                >
                  <SelectTrigger class="w-full">
                    <span>{editHandoffMode}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {#each PORTAL_HANDOFF_MODES as handoffMode}
                      <SelectItem value={handoffMode} label={handoffMode} />
                    {/each}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label class="mb-1 block text-xs text-muted-foreground">Compliance</Label>
                <Select
                  type="single"
                  value={editComplianceStatus}
                  onValueChange={(v) => { if (v) editComplianceStatus = v as PortalComplianceStatus }}
                >
                  <SelectTrigger class="w-full">
                    <span>{editComplianceStatus}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {#each PORTAL_COMPLIANCE_STATUSES as complianceStatus}
                      <SelectItem value={complianceStatus} label={complianceStatus} />
                    {/each}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <Label for="app-broker-origin" class="mb-1 block text-xs text-muted-foreground">Broker Origin</Label>
                <Input
                  id="app-broker-origin"
                  type="url"
                  bind:value={editBrokerOrigin}
                  disabled={editTransportMode !== 'portable_token'}
                />
              </div>
              <div>
                <Label for="app-manifest-path" class="mb-1 block text-xs text-muted-foreground">Manifest Path</Label>
                <Input
                  id="app-manifest-path"
                  type="text"
                  bind:value={editManifestPath}
                />
              </div>
            </div>
            <div>
              <Label for="app-sa-email" class="mb-1 block text-xs text-muted-foreground">Service Account Email (Google OIDC caller identity)</Label>
              <Input
                id="app-sa-email"
                type="email"
                bind:value={editServiceAccountEmail}
                placeholder="service-account@project.iam.gserviceaccount.com"
                class="w-full"
              />
              <p class="mt-1 text-xs text-muted-foreground">Google service account email of this app's Cloud Run runtime — used to authenticate the app when it calls portal endpoints (introspect) via OIDC. Leave blank to require legacy secret auth.</p>
            </div>
            {#if editError}
              <p class="text-xs text-destructive">{editError}</p>
            {/if}
            <div class="flex gap-2">
              <Button type="submit" size="sm" disabled={editPending}>
                {editPending ? 'Saving…' : 'Save'}
              </Button>
              <Button type="button" size="sm" variant="outline" onclick={() => editing = false}>Cancel</Button>
            </div>
          </form>
        {:else}
          <h1 class="text-xl font-semibold">{app.name}</h1>
          <p class="text-sm text-muted-foreground">{app.slug}</p>
        {/if}
      </div>
      {#if !editing}
        <div class="flex gap-2">
          <Button size="sm" variant="outline" onclick={startEdit}>Edit</Button>
          {#if confirmingDelete}
            <Button
              size="sm"
              variant="destructive"
              onclick={handleDelete}
              disabled={deletePending}
            >
              {deletePending ? 'Deleting…' : 'Confirm Delete'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onclick={() => {
                confirmingDelete = false
                deleteError = null
              }}
            >
              Cancel
            </Button>
          {:else}
            <Button
              size="sm"
              variant="destructive"
              onclick={() => {
                confirmingDelete = true
                deleteError = null
              }}
            >
              Delete
            </Button>
          {/if}
        </div>
      {/if}
    </div>

    {#if deleteError}
      <p class="mb-4 text-sm text-destructive">{deleteError}</p>
    {/if}

    {#if !editing}
      <Card class="max-w-lg">
        <CardContent class="space-y-3 pt-6">
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
            <Badge variant={app.status === 'active' ? 'default' : 'destructive'}>
              {app.status}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <!-- Team grants -->
      {#if app.teamGrants && app.teamGrants.length > 0}
        <div class="mt-6 max-w-lg">
          <h2 class="mb-3 text-sm font-semibold">Teams with Access</h2>
          <Card>
            <CardContent class="space-y-1 pt-4">
              {#each app.teamGrants as grant}
                <div class="flex items-center justify-between py-1">
                  <a href="/admin/teams/{grant.teamId}" class="text-sm text-primary hover:text-primary/80">{grant.teamName ?? grant.teamId}</a>
                </div>
              {/each}
            </CardContent>
          </Card>
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
          <Button
            size="sm"
            class="bg-yellow-700 text-yellow-100 hover:bg-yellow-600"
            onclick={() => copyToClipboard(revealedSecret!, () => { secretCopied = true })}
          >
            {secretCopied ? 'Copied!' : 'Copy'}
          </Button>
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
          <Button
            size="sm"
            class="bg-yellow-700 text-yellow-100 hover:bg-yellow-600"
            onclick={() => copyToClipboard(rotatedSecret!.secret, () => { rotatedCopied = true })}
          >
            {rotatedCopied ? 'Copied!' : 'Copy'}
          </Button>
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
          <Card>
            <CardContent class="pt-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium">{endpoint.url}</p>
                  <div class="mt-1 flex flex-wrap gap-1">
                    {#each endpoint.subscribedEvents as ev}
                      <Badge variant="secondary">{ev}</Badge>
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
                  <Button
                    size="sm"
                    variant="outline"
                    onclick={() => handleTestWebhook(endpoint.id)}
                    disabled={pendingTestWebhook === endpoint.id}
                  >
                    {pendingTestWebhook === endpoint.id ? 'Sending…' : 'Test'}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onclick={() => handleToggleStatus(endpoint)}
                    disabled={pendingToggleWebhook === endpoint.id}
                  >
                    {#if pendingToggleWebhook === endpoint.id}
                      Updating…
                    {:else if endpoint.status === 'active'}
                      Disable
                    {:else}
                      Enable
                    {/if}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onclick={() => handleRotateSecret(endpoint.id)}
                    disabled={pendingRotateWebhook === endpoint.id}
                  >
                    {pendingRotateWebhook === endpoint.id ? 'Rotating…' : 'Rotate secret'}
                  </Button>

                  {#if confirmingDeleteWebhook === endpoint.id}
                    <Button
                      size="sm"
                      variant="destructive"
                      onclick={() => handleDeleteWebhook(endpoint.id)}
                      disabled={pendingDeleteWebhook === endpoint.id}
                    >
                      {pendingDeleteWebhook === endpoint.id ? 'Deleting…' : 'Confirm delete'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onclick={() => { confirmingDeleteWebhook = null; webhookActionError = null }}
                    >
                      Cancel
                    </Button>
                  {:else}
                    <Button
                      size="sm"
                      variant="destructive"
                      onclick={() => { confirmingDeleteWebhook = endpoint.id; webhookActionError = null }}
                    >
                      Delete
                    </Button>
                  {/if}
                </div>
              </div>
            </CardContent>
          </Card>
        {/each}
      </div>
    {:else if !$webhooksQuery.isLoading}
      <p class="mb-4 text-xs text-muted-foreground">No webhook endpoints registered.</p>
    {/if}

    <!-- Register endpoint form -->
    <Card>
      <CardHeader>
        <CardTitle class="text-xs font-semibold text-muted-foreground">Register Endpoint</CardTitle>
      </CardHeader>
      <CardContent>
        <form onsubmit={handleRegisterWebhook} class="space-y-3">
          <div>
            <Label for="wh-url" class="mb-1 block text-xs text-muted-foreground">URL</Label>
            <Input
              id="wh-url"
              type="url"
              bind:value={newWebhookUrl}
              required
              placeholder="https://your-app.example.com/webhook"
              class="w-full"
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

          <Button
            type="submit"
            size="sm"
            disabled={registerPending}
          >
            {registerPending ? 'Registering…' : 'Register endpoint'}
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>

  <a href="/admin/apps" class="mt-6 inline-block text-xs text-primary hover:text-primary/80">&larr; Back to apps</a>
</div>
