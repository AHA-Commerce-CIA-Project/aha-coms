<script lang="ts">
  import { goto } from '$app/navigation'
  import { useQueryClient } from '@tanstack/svelte-query'
  import { appsQuery } from '$lib/queries/apps'
  import { adminApi } from '$lib/admin-api'
  import {
    DEFAULT_AUTH_TRANSPORT_MODE,
    PLATFORM_AUTH_CONTRACT_VERSION,
    PORTAL_ADAPTER_TYPES,
    PORTAL_COMPLIANCE_STATUSES,
    PORTAL_HANDOFF_MODES,
    type PortalAdapterType,
    type PortalComplianceStatus,
    type PortalHandoffMode,
  } from '@coms-portal/shared'

  const query = appsQuery()
  const queryClient = useQueryClient()
  const PORTAL_BROKER_ORIGIN = 'https://coms.ahacommerce.net'

  let registering = $state(false)
  let regName = $state('')
  let regSlug = $state('')
  let regUrl = $state('')
  let regBasePath = $state('')
  let regAdapterType = $state<PortalAdapterType>('server_middleware')
  let regTransportMode = $state(DEFAULT_AUTH_TRANSPORT_MODE)
  let regHandoffMode = $state<PortalHandoffMode>('one_time_code')
  let regBrokerOrigin = $state(PORTAL_BROKER_ORIGIN)
  let regContractVersion = $state(PLATFORM_AUTH_CONTRACT_VERSION)
  let regComplianceStatus = $state<PortalComplianceStatus>('draft')
  let regManifestPath = $state('portal.integration.json')
  let regError = $state<string | null>(null)
  let regPending = $state(false)

  function openRegister() {
    regName = ''
    regSlug = ''
    regUrl = ''
    regBasePath = ''
    regAdapterType = 'server_middleware'
    regTransportMode = DEFAULT_AUTH_TRANSPORT_MODE
    regHandoffMode = 'one_time_code'
    regBrokerOrigin = PORTAL_BROKER_ORIGIN
    regContractVersion = PLATFORM_AUTH_CONTRACT_VERSION
    regComplianceStatus = 'draft'
    regManifestPath = 'portal.integration.json'
    regError = null
    registering = true
  }

  async function handleRegister(e: SubmitEvent) {
    e.preventDefault()
    regError = null
    regPending = true
    try {
      const result = await adminApi.registerApp({
        name: regName,
        slug: regSlug,
        url: regUrl,
        basePath: regBasePath,
        adapterType: regAdapterType,
        transportMode: regTransportMode,
        handoffMode: regHandoffMode,
        brokerOrigin: regTransportMode === 'portable_token' ? regBrokerOrigin : undefined,
        contractVersion: regContractVersion,
        complianceStatus: regComplianceStatus,
        manifestPath: regManifestPath || undefined,
      })
      await queryClient.invalidateQueries({ queryKey: ['apps'] })
      registering = false
      await goto(`/admin/apps/${result.id}`)
    } catch (err) {
      regError = err instanceof Error ? err.message : 'Failed to register app'
    } finally {
      regPending = false
    }
  }
</script>

<div class="p-8">
  <div class="mb-6 flex items-center justify-between">
    <h1 class="text-xl font-semibold">App Registry</h1>
    {#if !registering}
      <button
        onclick={openRegister}
        class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium hover:bg-indigo-500"
      >
        Register App
      </button>
    {/if}
  </div>

  {#if registering}
    <form onsubmit={handleRegister} class="mb-6 max-w-lg space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
      <h2 class="text-sm font-semibold">Register New App</h2>
      <div>
        <label for="reg-name" class="mb-1 block text-xs text-neutral-400">Name</label>
        <input
          id="reg-name"
          type="text"
          bind:value={regName}
          required
          class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <div>
        <label for="reg-slug" class="mb-1 block text-xs text-neutral-400">Slug</label>
        <input
          id="reg-slug"
          type="text"
          bind:value={regSlug}
          required
          placeholder="e.g. my-app"
          class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <div>
        <label for="reg-url" class="mb-1 block text-xs text-neutral-400">URL</label>
        <input
          id="reg-url"
          type="url"
          bind:value={regUrl}
          required
          placeholder="https://example.com"
          class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <div>
        <label for="reg-base-path" class="mb-1 block text-xs text-neutral-400">Base Path</label>
        <input
          id="reg-base-path"
          type="text"
          bind:value={regBasePath}
          required
          placeholder="e.g. /app"
          class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label for="reg-adapter-type" class="mb-1 block text-xs text-neutral-400">Adapter Type</label>
          <select
            id="reg-adapter-type"
            bind:value={regAdapterType}
            class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            {#each PORTAL_ADAPTER_TYPES as adapterType}
              <option value={adapterType}>{adapterType}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="reg-transport-mode" class="mb-1 block text-xs text-neutral-400">Transport</label>
          <select
            id="reg-transport-mode"
            bind:value={regTransportMode}
            class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="portable_token">portal-brokered token</option>
            <option value="same_host_cookie">same-host cookie</option>
          </select>
        </div>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label for="reg-handoff-mode" class="mb-1 block text-xs text-neutral-400">Handoff Mode</label>
          <select
            id="reg-handoff-mode"
            bind:value={regHandoffMode}
            class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            {#each PORTAL_HANDOFF_MODES as handoffMode}
              <option value={handoffMode}>{handoffMode}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="reg-compliance-status" class="mb-1 block text-xs text-neutral-400">Compliance</label>
          <select
            id="reg-compliance-status"
            bind:value={regComplianceStatus}
            class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            {#each PORTAL_COMPLIANCE_STATUSES as complianceStatus}
              <option value={complianceStatus}>{complianceStatus}</option>
            {/each}
          </select>
        </div>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label for="reg-broker-origin" class="mb-1 block text-xs text-neutral-400">Broker Origin</label>
          <input
            id="reg-broker-origin"
            type="url"
            bind:value={regBrokerOrigin}
            disabled={regTransportMode !== 'portable_token'}
            class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none disabled:opacity-50"
          />
        </div>
        <div>
          <label for="reg-manifest-path" class="mb-1 block text-xs text-neutral-400">Manifest Path</label>
          <input
            id="reg-manifest-path"
            type="text"
            bind:value={regManifestPath}
            class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>
      {#if regError}
        <p class="text-xs text-red-400">{regError}</p>
      {/if}
      <div class="flex gap-2">
        <button type="submit" disabled={regPending} class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50">
          {regPending ? 'Registering…' : 'Register'}
        </button>
        <button type="button" onclick={() => registering = false} class="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-800">
          Cancel
        </button>
      </div>
    </form>
  {/if}

  {#if $query.isLoading}
    <div class="animate-pulse space-y-2">
      {#each Array(4) as _}
        <div class="h-12 rounded-lg bg-neutral-800"></div>
      {/each}
    </div>
  {:else if $query.data}
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-neutral-800 text-left text-xs text-neutral-400">
          <th class="pb-2 font-medium">Name</th>
          <th class="pb-2 font-medium">Slug</th>
          <th class="pb-2 font-medium">Transport</th>
          <th class="pb-2 font-medium">Compliance</th>
          <th class="pb-2 font-medium">URL</th>
          <th class="pb-2 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {#each $query.data as app}
          <tr class="border-b border-neutral-800/50 hover:bg-neutral-900">
            <td class="py-2">
              <a href="/admin/apps/{app.id}" class="text-indigo-400 hover:text-indigo-300">{app.name}</a>
            </td>
            <td class="py-2 text-neutral-400">{app.slug}</td>
            <td class="py-2 text-neutral-400">{app.transportMode}</td>
            <td class="py-2 text-neutral-400">{app.complianceStatus}</td>
            <td class="py-2 text-neutral-400">{app.url}</td>
            <td class="py-2">
              <span
                class="text-xs"
                class:text-green-400={app.status === 'active'}
                class:text-red-400={app.status !== 'active'}
              >
                {app.status}
              </span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if $query.data.length === 0}
      <p class="mt-4 text-sm text-neutral-500">No apps registered.</p>
    {/if}
  {:else if $query.error}
    <p class="text-sm text-red-400">Failed to load apps.</p>
  {/if}
</div>
