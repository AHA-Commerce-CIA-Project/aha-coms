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
  import { PUBLIC_PORTAL_ORIGIN } from '$lib/config'
  import {
    Button,
    Input,
    Label,
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    CardFooter,
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
    Badge,
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
  } from '@coms-portal/ui-svelte/primitives'

  const query = appsQuery()
  const queryClient = useQueryClient()
  const PORTAL_BROKER_ORIGIN = PUBLIC_PORTAL_ORIGIN

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
  // Spec 03d D12 — optional admin-managed manifest written alongside the
  // app_registry row. Empty configSchema (i.e. {}) means no app_manifests
  // row is created and the app boots without managed config.
  let regSchemaVersion = $state(1)
  let regTaxonomiesCsv = $state('')
  let regConfigSchemaJson = $state('')
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
    regSchemaVersion = 1
    regTaxonomiesCsv = ''
    regConfigSchemaJson = ''
    regError = null
    registering = true
  }

  async function handleRegister(e: SubmitEvent) {
    e.preventDefault()
    regError = null
    regPending = true
    try {
      let manifest: {
        configSchema: Record<string, unknown>
        schemaVersion?: number
        taxonomies?: string[]
      } | undefined

      const trimmedSchema = regConfigSchemaJson.trim()
      if (trimmedSchema.length > 0) {
        let parsed: unknown
        try {
          parsed = JSON.parse(trimmedSchema)
        } catch (err) {
          throw new Error(
            `configSchema is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('configSchema must be a JSON object')
        }
        const taxonomies = regTaxonomiesCsv
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
        manifest = {
          configSchema: parsed as Record<string, unknown>,
          schemaVersion: regSchemaVersion,
          ...(taxonomies.length > 0 ? { taxonomies } : {}),
        }
      }

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
        ...(manifest ? { manifest } : {}),
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
    <Button onclick={openRegister} size="sm">Register App</Button>
  </div>

  <!-- Register Modal -->
  <Dialog bind:open={registering}>
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle>Register New App</DialogTitle>
        <DialogDescription class="sr-only">Register a new application in the COMS app registry.</DialogDescription>
      </DialogHeader>
      <form onsubmit={handleRegister} class="space-y-3">
        <div>
          <Label for="reg-name" class="mb-1 block text-xs text-muted-foreground">Name</Label>
          <Input
            id="reg-name"
            type="text"
            bind:value={regName}
            required
            class="w-full"
          />
        </div>
        <div>
          <Label for="reg-slug" class="mb-1 block text-xs text-muted-foreground">Slug</Label>
          <Input
            id="reg-slug"
            type="text"
            bind:value={regSlug}
            required
            placeholder="e.g. my-app"
            class="w-full"
          />
        </div>
        <div>
          <Label for="reg-url" class="mb-1 block text-xs text-muted-foreground">URL</Label>
          <Input
            id="reg-url"
            type="url"
            bind:value={regUrl}
            required
            placeholder="https://example.com"
            class="w-full"
          />
        </div>
        <div>
          <Label for="reg-base-path" class="mb-1 block text-xs text-muted-foreground">Base Path</Label>
          <Input
            id="reg-base-path"
            type="text"
            bind:value={regBasePath}
            required
            placeholder="e.g. /app"
            class="w-full"
          />
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <Label class="mb-1 block text-xs text-muted-foreground">Adapter Type</Label>
            <Select
              type="single"
              value={regAdapterType}
              onValueChange={(v) => { if (v) regAdapterType = v as PortalAdapterType }}
            >
              <SelectTrigger class="w-full">
                <span>{regAdapterType}</span>
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
              value={regTransportMode}
              onValueChange={(v) => { if (v) regTransportMode = v as typeof regTransportMode }}
            >
              <SelectTrigger class="w-full">
                <span>{regTransportMode === 'portable_token' ? 'portal-brokered token' : 'same-host cookie'}</span>
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
              value={regHandoffMode}
              onValueChange={(v) => { if (v) regHandoffMode = v as PortalHandoffMode }}
            >
              <SelectTrigger class="w-full">
                <span>{regHandoffMode}</span>
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
              value={regComplianceStatus}
              onValueChange={(v) => { if (v) regComplianceStatus = v as PortalComplianceStatus }}
            >
              <SelectTrigger class="w-full">
                <span>{regComplianceStatus}</span>
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
            <Label for="reg-broker-origin" class="mb-1 block text-xs text-muted-foreground">Broker Origin</Label>
            <Input
              id="reg-broker-origin"
              type="url"
              bind:value={regBrokerOrigin}
              disabled={regTransportMode !== 'portable_token'}
              class="w-full"
            />
          </div>
          <div>
            <Label for="reg-manifest-path" class="mb-1 block text-xs text-muted-foreground">Manifest Path</Label>
            <Input
              id="reg-manifest-path"
              type="text"
              bind:value={regManifestPath}
              class="w-full"
            />
          </div>
        </div>
        <!-- Spec 03d D12 — optional managed-config manifest. Leave configSchema empty to skip. -->
        <details class="rounded-md border border-border/60 bg-muted/30 p-3">
          <summary class="cursor-pointer text-xs font-medium text-muted-foreground">
            Managed config (optional)
          </summary>
          <p class="mt-2 text-[11px] leading-snug text-muted-foreground">
            Define portal-managed per-user knobs for this app. Leave configSchema blank
            to skip — the app will still authenticate via broker/webhook.
          </p>
          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label for="reg-schema-version" class="mb-1 block text-xs text-muted-foreground">Schema Version</Label>
              <Input
                id="reg-schema-version"
                type="number"
                min="1"
                bind:value={regSchemaVersion}
                class="w-full"
              />
            </div>
            <div>
              <Label for="reg-taxonomies" class="mb-1 block text-xs text-muted-foreground">
                Taxonomies (comma-separated, e.g. <code>branches, teams</code>)
              </Label>
              <Input
                id="reg-taxonomies"
                type="text"
                bind:value={regTaxonomiesCsv}
                placeholder="branches, teams, departments"
                class="w-full"
              />
            </div>
          </div>
          <div class="mt-3">
            <Label for="reg-config-schema" class="mb-1 block text-xs text-muted-foreground">
              configSchema (JSON object)
            </Label>
            <textarea
              id="reg-config-schema"
              bind:value={regConfigSchemaJson}
              rows="6"
              placeholder={'{\n  "leaderboard_eligible": { "type": "boolean", "default": true }\n}'}
              class="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs"
            ></textarea>
          </div>
        </details>
        {#if regError}
          <p class="text-xs text-destructive">{regError}</p>
        {/if}
        <DialogFooter>
          <Button type="button" variant="outline" onclick={() => (registering = false)}>Cancel</Button>
          <Button type="submit" disabled={regPending}>
            {regPending ? 'Registering…' : 'Register'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>

  {#if $query.isLoading}
    <div class="animate-pulse space-y-2">
      {#each Array(4) as _}
        <div class="h-12 rounded-lg bg-muted"></div>
      {/each}
    </div>
  {:else if $query.data}
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Slug</TableHead>
          <TableHead>Transport</TableHead>
          <TableHead>Compliance</TableHead>
          <TableHead>URL</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {#each $query.data as app}
          <TableRow>
            <TableCell>
              <a href="/admin/apps/{app.id}" class="text-primary hover:text-primary/80">{app.name}</a>
            </TableCell>
            <TableCell class="text-muted-foreground">{app.slug}</TableCell>
            <TableCell class="text-muted-foreground">{app.transportMode}</TableCell>
            <TableCell class="text-muted-foreground">{app.complianceStatus}</TableCell>
            <TableCell class="text-muted-foreground">{app.url}</TableCell>
            <TableCell>
              <Badge variant={app.status === 'active' ? 'default' : 'destructive'}>
                {app.status}
              </Badge>
            </TableCell>
          </TableRow>
        {/each}
      </TableBody>
    </Table>
    {#if $query.data.length === 0}
      <p class="mt-4 text-sm text-muted-foreground">No apps registered.</p>
    {/if}
  {:else if $query.error}
    <p class="text-sm text-destructive">Failed to load apps.</p>
  {/if}
</div>
