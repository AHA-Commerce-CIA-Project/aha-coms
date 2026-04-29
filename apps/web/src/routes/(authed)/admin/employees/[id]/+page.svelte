<script lang="ts">
  import { page } from '$app/stores'
  import { employeeQuery, updateEmployeeMutation } from '$lib/queries/employees'
  import { teamsQuery } from '$lib/queries/teams'
  import { adminApi } from '$lib/admin-api'
  import { useQueryClient } from '@tanstack/svelte-query'
  import { PORTAL_ROLES, PORTAL_ROLE_LABELS, type PortalRole } from '@coms-portal/shared'
  import {
    Button,
    Input,
    Badge,
    Card,
    CardContent,
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
  } from '@coms-portal/ui/primitives'

  const ROLES = PORTAL_ROLES

  const id = $derived($page.params.id!)
  const query = $derived(employeeQuery(id))
  const mutation = updateEmployeeMutation()
  const teams = teamsQuery()
  const queryClient = useQueryClient()
  const provisioningFailedFromCreate = $derived($page.url.searchParams.get('provisioning') === 'failed')

  // Role
  let selectedRole = $state<PortalRole | null>(null)
  const dirty = $derived(selectedRole !== null && $query.data && selectedRole !== $query.data.portalRole)

  // Reset / Deactivate / Provisioning state
  let resetMessage = $state<string | null>(null)
  let resetError = $state<string | null>(null)
  let resetPending = $state(false)
  let deleteError = $state<string | null>(null)
  let deletePending = $state(false)
  let confirmingDeactivate = $state(false)
  let provisioningMessage = $state<string | null>(null)
  let provisioningError = $state<string | null>(null)
  let retryProvisioningPending = $state(false)

  // Workspace upgrade
  let editingWorkspace = $state(false)
  let workspaceEmail = $state('')
  let workspaceError = $state<string | null>(null)
  let workspacePending = $state(false)

  // Phone (WA)
  let editingPhone = $state(false)
  let phoneValue = $state('')
  let phonePending = $state(false)
  let phoneError = $state<string | null>(null)

  // Birth Date
  let editingBirthDate = $state(false)
  let birthDateValue = $state('')
  let birthDatePending = $state(false)
  let birthDateError = $state<string | null>(null)

  // Position
  let editingPosition = $state(false)
  let positionValue = $state('')
  let positionPending = $state(false)
  let positionError = $state<string | null>(null)

  // Personal Email
  let editingPersonalEmail = $state(false)
  let personalEmailValue = $state('')
  let personalEmailPending = $state(false)
  let personalEmailError = $state<string | null>(null)

  // Leader
  let editingLeader = $state(false)
  let leaderValue = $state('')
  let leaderPending = $state(false)
  let leaderError = $state<string | null>(null)

  // Team
  let editingTeam = $state(false)
  let teamIdValue = $state('')
  let teamPending = $state(false)
  let teamError = $state<string | null>(null)

  // Branch
  let editingBranch = $state(false)
  let branchValue = $state<'Indonesia' | 'Thailand' | ''>('')
  let branchPending = $state(false)
  let branchError = $state<string | null>(null)

  // Sync selectedRole when data loads
  $effect(() => {
    if ($query.data && selectedRole === null) {
      selectedRole = $query.data.portalRole
    }
  })

  async function handleSaveRole() {
    if (!dirty || !selectedRole) return
    await $mutation.mutateAsync({ id, data: { portalRole: selectedRole } })
  }

  async function handleDeactivate() {
    deleteError = null
    deletePending = true
    try {
      await adminApi.deleteEmployee(id)
      confirmingDeactivate = false
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['employees', id] }),
        queryClient.invalidateQueries({ queryKey: ['employees'] }),
      ])
    } catch (error) {
      deleteError = error instanceof Error ? error.message : 'Failed to deactivate employee'
    } finally {
      deletePending = false
    }
  }

  async function handleResetPassword() {
    resetMessage = null
    resetError = null
    resetPending = true
    try {
      const result = await adminApi.resetEmployeePassword(id)
      resetMessage = `Password reset email sent to ${result.email}.`
    } catch (error) {
      resetError = error instanceof Error ? error.message : 'Failed to send reset email'
    } finally {
      resetPending = false
    }
  }

  async function handleUpgradeWorkspace() {
    workspaceError = null
    workspacePending = true
    try {
      await $mutation.mutateAsync({ id, data: { email: workspaceEmail, hasGoogleWorkspace: true } })
      editingWorkspace = false
      workspaceEmail = ''
    } catch (error) {
      workspaceError = error instanceof Error ? error.message : 'Failed to update'
    } finally {
      workspacePending = false
    }
  }

  async function handleRetryProvisioning() {
    provisioningMessage = null
    provisioningError = null
    retryProvisioningPending = true
    try {
      const result = await adminApi.retryEmployeeProvisioning(id)
      if (result.status === 'ready') {
        provisioningMessage = 'Employee provisioning completed successfully.'
      } else {
        provisioningError = result.error ?? 'Employee provisioning did not complete successfully.'
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['employees', id] }),
        queryClient.invalidateQueries({ queryKey: ['employees'] }),
      ])
    } catch (error) {
      provisioningError = error instanceof Error ? error.message : 'Failed to retry provisioning'
    } finally {
      retryProvisioningPending = false
    }
  }

  async function handleSavePhone() {
    phoneError = null
    phonePending = true
    try {
      await $mutation.mutateAsync({ id, data: { phone: phoneValue } })
      editingPhone = false
    } catch (error) {
      phoneError = error instanceof Error ? error.message : 'Failed to save'
    } finally {
      phonePending = false
    }
  }

  async function handleSaveBirthDate() {
    birthDateError = null
    birthDatePending = true
    try {
      await $mutation.mutateAsync({ id, data: { birthDate: birthDateValue } })
      editingBirthDate = false
    } catch (error) {
      birthDateError = error instanceof Error ? error.message : 'Failed to save'
    } finally {
      birthDatePending = false
    }
  }

  async function handleSavePosition() {
    positionError = null
    positionPending = true
    try {
      await $mutation.mutateAsync({ id, data: { position: positionValue } })
      editingPosition = false
    } catch (error) {
      positionError = error instanceof Error ? error.message : 'Failed to save'
    } finally {
      positionPending = false
    }
  }

  async function handleSavePersonalEmail() {
    personalEmailError = null
    personalEmailPending = true
    try {
      await $mutation.mutateAsync({ id, data: { personalEmail: personalEmailValue } })
      editingPersonalEmail = false
    } catch (error) {
      personalEmailError = error instanceof Error ? error.message : 'Failed to save'
    } finally {
      personalEmailPending = false
    }
  }

  async function handleSaveLeader() {
    leaderError = null
    leaderPending = true
    try {
      await $mutation.mutateAsync({ id, data: { leaderName: leaderValue } })
      editingLeader = false
    } catch (error) {
      leaderError = error instanceof Error ? error.message : 'Failed to save'
    } finally {
      leaderPending = false
    }
  }

  async function handleSaveTeam() {
    teamError = null
    teamPending = true
    try {
      await $mutation.mutateAsync({ id, data: { teamId: teamIdValue || undefined } })
      editingTeam = false
    } catch (error) {
      teamError = error instanceof Error ? error.message : 'Failed to save'
    } finally {
      teamPending = false
    }
  }

  async function handleSaveBranch() {
    branchError = null
    branchPending = true
    try {
      await $mutation.mutateAsync({ id, data: { branch: branchValue || undefined } })
      editingBranch = false
    } catch (error) {
      branchError = error instanceof Error ? error.message : 'Failed to save'
    } finally {
      branchPending = false
    }
  }
</script>

<div class="p-8">
  {#if $query.isLoading}
    <div class="animate-pulse space-y-4">
      <div class="h-8 w-48 rounded bg-muted"></div>
      <div class="h-64 rounded-xl bg-muted"></div>
    </div>
  {:else if $query.data}
    {@const emp = $query.data}
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold">{emp.name}</h1>
        <p class="text-sm text-muted-foreground">{emp.email}</p>
        {#if provisioningFailedFromCreate}
          <p class="mt-2 text-xs text-status-pending">Employee was created, but provisioning failed. Retry provisioning below.</p>
        {/if}
        {#if resetMessage}
          <p class="mt-2 text-xs text-status-active">{resetMessage}</p>
        {/if}
        {#if resetError}
          <p class="mt-2 text-xs text-destructive">{resetError}</p>
        {/if}
        {#if deleteError}
          <p class="mt-2 text-xs text-destructive">{deleteError}</p>
        {/if}
        {#if provisioningMessage}
          <p class="mt-2 text-xs text-status-active">{provisioningMessage}</p>
        {/if}
        {#if provisioningError}
          <p class="mt-2 text-xs text-destructive">{provisioningError}</p>
        {/if}
      </div>
      <div class="flex gap-2">
        {#if emp.provisioningStatus === 'ready'}
          <Button
            variant="outline"
            size="sm"
            onclick={handleResetPassword}
            disabled={resetPending}
          >
            {resetPending ? 'Sending…' : 'Reset Password'}
          </Button>
        {/if}
        {#if confirmingDeactivate}
          <div class="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              onclick={handleDeactivate}
              disabled={deletePending}
            >
              {deletePending ? 'Deactivating…' : 'Confirm Deactivate'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onclick={() => { confirmingDeactivate = false; deleteError = null }}
            >
              Cancel
            </Button>
          </div>
        {:else}
          <Button
            variant="destructive"
            size="sm"
            onclick={() => { confirmingDeactivate = true; deleteError = null }}
          >
            Deactivate
          </Button>
        {/if}
      </div>
    </div>

    <Card class="max-w-lg">
      <CardContent class="space-y-3 pt-6">
        <!-- Role -->
        <div class="flex items-center justify-between border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Role</span>
          <div class="flex items-center gap-2">
            <Select
              type="single"
              value={selectedRole ?? undefined}
              onValueChange={(v) => { if (v) selectedRole = v as PortalRole }}
            >
              <SelectTrigger size="sm" class="w-32">
                <span>{selectedRole ? PORTAL_ROLE_LABELS[selectedRole] : ''}</span>
              </SelectTrigger>
              <SelectContent>
                {#each ROLES as role}
                  <SelectItem value={role} label={PORTAL_ROLE_LABELS[role]} />
                {/each}
              </SelectContent>
            </Select>
            {#if dirty}
              <Button
                size="sm"
                onclick={handleSaveRole}
                disabled={$mutation.isPending}
              >
                {$mutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            {/if}
          </div>
        </div>

        <!-- Department (read-only) -->
        <div class="flex justify-between border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Department</span>
          <span class="text-sm">{emp.department ?? '-'}</span>
        </div>

        <!-- Position (editable) -->
        <div class="flex items-start justify-between gap-4 border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Position</span>
          <div class="text-right">
            {#if editingPosition}
              <div class="flex flex-col items-end gap-2">
                <Input
                  type="text"
                  bind:value={positionValue}
                  class="rounded-lg"
                />
                {#if positionError}
                  <p class="text-xs text-destructive">{positionError}</p>
                {/if}
                <div class="flex gap-2">
                  <Button
                    size="sm"
                    onclick={handleSavePosition}
                    disabled={positionPending}
                  >
                    {positionPending ? 'Saving…' : 'Save'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onclick={() => { editingPosition = false; positionError = null }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            {:else}
              <div class="flex items-center gap-2">
                <span class="text-sm">{emp.position ?? '-'}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onclick={() => { editingPosition = true; positionValue = emp.position ?? '' }}
                >
                  Edit
                </Button>
              </div>
            {/if}
          </div>
        </div>

        <!-- Phone / WA (editable) -->
        <div class="flex items-start justify-between gap-4 border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Phone (WA)</span>
          <div class="text-right">
            {#if editingPhone}
              <div class="flex flex-col items-end gap-2">
                <Input
                  type="text"
                  bind:value={phoneValue}
                  class="rounded-lg"
                />
                {#if phoneError}
                  <p class="text-xs text-destructive">{phoneError}</p>
                {/if}
                <div class="flex gap-2">
                  <Button
                    size="sm"
                    onclick={handleSavePhone}
                    disabled={phonePending}
                  >
                    {phonePending ? 'Saving…' : 'Save'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onclick={() => { editingPhone = false; phoneError = null }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            {:else}
              <div class="flex items-center gap-2">
                <span class="text-sm">{emp.phone ?? '-'}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onclick={() => { editingPhone = true; phoneValue = emp.phone ?? '' }}
                >
                  Edit
                </Button>
              </div>
            {/if}
          </div>
        </div>

        <!-- Birth Date (editable) -->
        <div class="flex items-start justify-between gap-4 border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Birth Date</span>
          <div class="text-right">
            {#if editingBirthDate}
              <div class="flex flex-col items-end gap-2">
                <Input
                  type="date"
                  bind:value={birthDateValue}
                  class="rounded-lg"
                />
                {#if birthDateError}
                  <p class="text-xs text-destructive">{birthDateError}</p>
                {/if}
                <div class="flex gap-2">
                  <Button
                    size="sm"
                    onclick={handleSaveBirthDate}
                    disabled={birthDatePending}
                  >
                    {birthDatePending ? 'Saving…' : 'Save'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onclick={() => { editingBirthDate = false; birthDateError = null }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            {:else}
              <div class="flex items-center gap-2">
                <span class="text-sm">{(emp as any).birthDate ?? '-'}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onclick={() => { editingBirthDate = true; birthDateValue = (emp as any).birthDate ?? '' }}
                >
                  Edit
                </Button>
              </div>
            {/if}
          </div>
        </div>

        <!-- Personal Email (editable) -->
        <div class="flex items-start justify-between gap-4 border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Personal Email</span>
          <div class="text-right">
            {#if editingPersonalEmail}
              <div class="flex flex-col items-end gap-2">
                <Input
                  type="email"
                  bind:value={personalEmailValue}
                  class="rounded-lg"
                />
                {#if personalEmailError}
                  <p class="text-xs text-destructive">{personalEmailError}</p>
                {/if}
                <div class="flex gap-2">
                  <Button
                    size="sm"
                    onclick={handleSavePersonalEmail}
                    disabled={personalEmailPending}
                  >
                    {personalEmailPending ? 'Saving…' : 'Save'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onclick={() => { editingPersonalEmail = false; personalEmailError = null }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            {:else}
              <div class="flex items-center gap-2">
                <span class="text-sm">{(emp as any).personalEmail ?? '-'}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onclick={() => { editingPersonalEmail = true; personalEmailValue = (emp as any).personalEmail ?? '' }}
                >
                  Edit
                </Button>
              </div>
            {/if}
          </div>
        </div>

        <!-- Leader (editable) -->
        <div class="flex items-start justify-between gap-4 border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Leader</span>
          <div class="text-right">
            {#if editingLeader}
              <div class="flex flex-col items-end gap-2">
                <Input
                  type="text"
                  bind:value={leaderValue}
                  class="rounded-lg"
                />
                {#if leaderError}
                  <p class="text-xs text-destructive">{leaderError}</p>
                {/if}
                <div class="flex gap-2">
                  <Button
                    size="sm"
                    onclick={handleSaveLeader}
                    disabled={leaderPending}
                  >
                    {leaderPending ? 'Saving…' : 'Save'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onclick={() => { editingLeader = false; leaderError = null }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            {:else}
              <div class="flex items-center gap-2">
                <span class="text-sm">{(emp as any).leaderName ?? '-'}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onclick={() => { editingLeader = true; leaderValue = (emp as any).leaderName ?? '' }}
                >
                  Edit
                </Button>
              </div>
            {/if}
          </div>
        </div>

        <!-- Team (editable) -->
        <div class="flex items-start justify-between gap-4 border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Team</span>
          <div class="text-right">
            {#if editingTeam}
              <div class="flex flex-col items-end gap-2">
                <Select
                  type="single"
                  value={teamIdValue || undefined}
                  onValueChange={(v) => { teamIdValue = v ?? '' }}
                >
                  <SelectTrigger size="sm" class="w-40">
                    <span>
                      {#if teamIdValue && $teams.data}
                        {$teams.data.find((t) => t.id === teamIdValue)?.name ?? 'No team'}
                      {:else}
                        No team
                      {/if}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="" label="No team" />
                    {#if $teams.data}
                      {#each $teams.data as team}
                        <SelectItem value={team.id} label={team.name} />
                      {/each}
                    {/if}
                  </SelectContent>
                </Select>
                {#if teamError}
                  <p class="text-xs text-destructive">{teamError}</p>
                {/if}
                <div class="flex gap-2">
                  <Button
                    size="sm"
                    onclick={handleSaveTeam}
                    disabled={teamPending}
                  >
                    {teamPending ? 'Saving…' : 'Save'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onclick={() => { editingTeam = false; teamError = null }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            {:else}
              <div class="flex items-center gap-2">
                <span class="text-sm">
                  {#if (emp as any).teamId && $teams.data}
                    {$teams.data.find((t) => t.id === (emp as any).teamId)?.name ?? 'Unknown team'}
                  {:else}
                    No team
                  {/if}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onclick={() => { editingTeam = true; teamIdValue = (emp as any).teamId ?? '' }}
                >
                  Edit
                </Button>
              </div>
            {/if}
          </div>
        </div>

        <!-- Branch (editable) -->
        <div class="flex items-start justify-between gap-4 border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Branch</span>
          <div class="text-right">
            {#if editingBranch}
              <div class="flex flex-col items-end gap-2">
                <Select
                  type="single"
                  value={branchValue || undefined}
                  onValueChange={(v) => { branchValue = (v ?? '') as 'Indonesia' | 'Thailand' | '' }}
                >
                  <SelectTrigger size="sm" class="w-32">
                    <span>{branchValue || 'Not set'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="" label="Not set" />
                    <SelectItem value="Indonesia" label="Indonesia" />
                    <SelectItem value="Thailand" label="Thailand" />
                  </SelectContent>
                </Select>
                {#if branchError}
                  <p class="text-xs text-destructive">{branchError}</p>
                {/if}
                <div class="flex gap-2">
                  <Button
                    size="sm"
                    onclick={handleSaveBranch}
                    disabled={branchPending}
                  >
                    {branchPending ? 'Saving…' : 'Save'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onclick={() => { editingBranch = false; branchError = null }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            {:else}
              <div class="flex items-center gap-2">
                <span class="text-sm capitalize">{emp.branch ?? '-'}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onclick={() => { editingBranch = true; branchValue = (emp.branch as 'Indonesia' | 'Thailand' | '') ?? '' }}
                >
                  Edit
                </Button>
              </div>
            {/if}
          </div>
        </div>

        <!-- Status (read-only) -->
        <div class="flex justify-between border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Status</span>
          <Badge variant={emp.status === 'active' ? 'default' : 'destructive'}>
            {emp.status}
          </Badge>
        </div>

        <!-- Workspace upgrade -->
        {#if !emp.hasGoogleWorkspace}
          <div class="flex items-start justify-between gap-4 border-b border-border pb-2">
            <span class="text-xs text-muted-foreground">Workspace</span>
            <div class="text-right">
              {#if editingWorkspace}
                <div class="flex flex-col items-end gap-2">
                  <Input
                    type="email"
                    bind:value={workspaceEmail}
                    placeholder="workspace@ahacommerce.net"
                    class="rounded-lg"
                  />
                  {#if workspaceError}
                    <p class="text-xs text-destructive">{workspaceError}</p>
                  {/if}
                  <div class="flex gap-2">
                    <Button
                      size="sm"
                      onclick={handleUpgradeWorkspace}
                      disabled={!workspaceEmail || workspacePending}
                    >
                      {workspacePending ? 'Saving…' : 'Save'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onclick={() => { editingWorkspace = false; workspaceEmail = ''; workspaceError = null }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              {:else}
                <div class="flex items-center gap-2">
                  <span class="text-sm text-muted-foreground">No workspace account</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onclick={() => { editingWorkspace = true; workspaceEmail = '' }}
                  >
                    Upgrade
                  </Button>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Provisioning -->
        <div class="flex items-start justify-between gap-4 border-b border-border pb-2">
          <span class="text-xs text-muted-foreground">Provisioning</span>
          <div class="text-right">
            <p
              class="text-sm"
              class:text-status-active={emp.provisioningStatus === 'ready'}
              class:text-status-pending={emp.provisioningStatus === 'pending' || emp.provisioningStatus === 'processing'}
              class:text-destructive={emp.provisioningStatus === 'failed'}
            >
              {emp.provisioningStatus}
            </p>
            {#if emp.provisioningError}
              <p class="mt-1 text-xs text-destructive">{emp.provisioningError}</p>
            {/if}
            {#if emp.provisioningStatus === 'failed' && emp.status === 'active'}
              <Button
                size="sm"
                variant="outline"
                class="mt-2"
                onclick={handleRetryProvisioning}
                disabled={retryProvisioningPending}
              >
                {retryProvisioningPending ? 'Retrying…' : 'Retry Provisioning'}
              </Button>
            {/if}
          </div>
        </div>
      </CardContent>
    </Card>
  {:else}
    <p class="text-sm text-muted-foreground">Employee not found.</p>
  {/if}

  <a href="/admin/employees" class="mt-6 inline-block text-xs text-primary hover:text-primary/80">&larr; Back to employees</a>
</div>
