<script lang="ts">
  import { page } from '$app/stores'
  import { getContext, onMount } from 'svelte'
  import { employeeQuery, updateEmployeeMutation } from '$lib/queries/employees'
  import { teamsQuery } from '$lib/queries/teams'
  import { adminApi } from '$lib/admin-api'
  import { useQueryClient } from '@tanstack/svelte-query'
  import { PORTAL_ROLES, PORTAL_ROLE_LABELS, type PortalRole } from '@coms-portal/shared'
  import type { SessionUser } from '$lib/auth'
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

  // Current user — used to gate the super_admin-only one-time login link card.
  const getCurrentUser = getContext<() => SessionUser | null>('user')
  const currentUser = $derived(getCurrentUser?.() ?? null)
  const canIssueOneTimeLoginLinks = $derived(
    currentUser?.capabilities?.canIssueOneTimeLoginLinks === true,
  )

  const ROLES = PORTAL_ROLES

  const id = $derived($page.params.id!)
  const query = $derived(employeeQuery(id))
  const mutation = updateEmployeeMutation()
  const teams = teamsQuery()
  const queryClient = useQueryClient()
  const provisioningFailedFromCreate = $derived($page.url.searchParams.get('provisioning') === 'failed')

  // Spec 06 PR E §9 — sign-out-all state
  let signOutAllPending = $state(false)
  let signOutAllResult = $state<{ revoked: number } | null>(null)
  let signOutAllError = $state<string | null>(null)
  let confirmingSignOutAll = $state(false)

  async function handleSignOutAll() {
    signOutAllPending = true
    signOutAllError = null
    signOutAllResult = null
    try {
      const r = await adminApi.signOutAllSessions(id)
      signOutAllResult = r
    } catch (err) {
      signOutAllError = (err as Error)?.message ?? 'Failed to sign out sessions'
    } finally {
      signOutAllPending = false
      confirmingSignOutAll = false
    }
  }

  // Spec 06 PR E §11 — one-time login link state (super_admin only)
  type OneTimeReason = 'lost_email_access' | 'support_handoff' | 'identity_recovery' | 'other'
  const REASON_LABELS: Record<OneTimeReason, string> = {
    lost_email_access: 'Lost email access',
    support_handoff: 'Support hand-off',
    identity_recovery: 'Identity recovery',
    other: 'Other (free text)',
  }
  let showLinkModal = $state(false)
  let linkReason = $state<OneTimeReason>('lost_email_access')
  let linkReasonText = $state('')
  let linkPending = $state(false)
  let linkError = $state<string | null>(null)
  let linkResult = $state<{ url: string; expiresAt: string } | null>(null)
  let linkCopied = $state(false)

  type LinkHistoryEntry = {
    id: string
    issuedBy: { id: string; name: string }
    reason: string
    reasonText: string | null
    expiresAt: string
    consumedAt: string | null
    createdAt: string
  }
  let linkHistory = $state<LinkHistoryEntry[]>([])
  let linkHistoryLoading = $state(false)

  async function refreshLinkHistory() {
    if (!canIssueOneTimeLoginLinks) return
    linkHistoryLoading = true
    try {
      const r = await adminApi.listOneTimeLoginLinks(id)
      linkHistory = r.links
    } catch {
      linkHistory = []
    } finally {
      linkHistoryLoading = false
    }
  }

  function openLinkModal() {
    showLinkModal = true
    linkReason = 'lost_email_access'
    linkReasonText = ''
    linkError = null
    linkResult = null
    linkCopied = false
  }

  function closeLinkModal() {
    showLinkModal = false
    linkResult = null
    linkCopied = false
  }

  async function handleIssueLink() {
    if (linkReasonText.trim().length === 0) {
      linkError = 'Please write a short reason — this is recorded in the audit log.'
      return
    }
    linkPending = true
    linkError = null
    try {
      const r = await adminApi.issueOneTimeLoginLink(id, {
        reason: linkReason,
        reasonText: linkReasonText.trim(),
      })
      linkResult = { url: r.url, expiresAt: r.expiresAt }
      await refreshLinkHistory()
    } catch (err) {
      linkError = (err as Error)?.message ?? 'Failed to issue link'
    } finally {
      linkPending = false
    }
  }

  async function copyLinkUrl() {
    if (!linkResult) return
    try {
      await navigator.clipboard.writeText(linkResult.url)
      linkCopied = true
      setTimeout(() => { linkCopied = false }, 2000)
    } catch {
      linkCopied = false
    }
  }

  onMount(() => {
    refreshLinkHistory()
  })

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

  // Email management (PR D)
  let addEmailKind = $state<'workspace' | 'personal'>('personal')
  let addEmailValue = $state('')
  let addEmailPending = $state(false)
  let addEmailError = $state<string | null>(null)
  let editingEmailId = $state<string | null>(null)
  let editEmailValue = $state('')
  let emailRowError = $state<string | null>(null)
  let confirmRemoveEmailId = $state<string | null>(null)

  function displayEmail(e: { emails?: { address: string; kind: string; isPrimary: boolean }[] }): string {
    if (!e.emails || e.emails.length === 0) return '(no email)'
    const ws = e.emails.find((x) => x.kind === 'workspace')
    if (ws) return ws.address
    const primary = e.emails.find((x) => x.isPrimary)
    if (primary) return primary.address
    return e.emails[0].address
  }

  async function refetchEmployee() {
    await queryClient.invalidateQueries({ queryKey: ['employees', id] })
  }

  async function handleAddEmail() {
    addEmailError = null
    if (!addEmailValue.trim()) {
      addEmailError = 'Email is required.'
      return
    }
    addEmailPending = true
    const result = await adminApi.addEmployeeEmail(id, { email: addEmailValue.trim(), kind: addEmailKind })
    addEmailPending = false
    switch (result.kind) {
      case 'added':
        addEmailValue = ''
        await refetchEmployee()
        return
      case 'email_in_use':
        addEmailError = `This email already belongs to ${result.collisionUserName} (${result.collisionUserId.slice(0, 8)}…). Resolve the collision first.`
        return
      case 'target_not_found':
        addEmailError = 'User not found.'
        return
      case 'network_error':
        addEmailError = result.message
        return
    }
  }

  async function handleSaveEditEmail(emailId: string) {
    emailRowError = null
    if (!editEmailValue.trim()) {
      emailRowError = 'Email is required.'
      return
    }
    const result = await adminApi.updateEmployeeEmail(id, emailId, { email: editEmailValue.trim() })
    switch (result.kind) {
      case 'updated':
        editingEmailId = null
        editEmailValue = ''
        await refetchEmployee()
        return
      case 'email_in_use':
        emailRowError = `This email already belongs to ${result.collisionUserName}.`
        return
      case 'not_found':
        emailRowError = 'Email row not found.'
        return
      case 'not_verified':
      case 'network_error':
        emailRowError = result.message
        return
    }
  }

  async function handleSetEmailPrimaryAdmin(emailId: string) {
    emailRowError = null
    const result = await adminApi.updateEmployeeEmail(id, emailId, { isPrimary: true })
    if (result.kind === 'updated') {
      await refetchEmployee()
      return
    }
    if (result.kind === 'not_verified') {
      emailRowError = result.message
      return
    }
    if (result.kind === 'not_found') {
      emailRowError = 'Email row not found.'
      return
    }
    if (result.kind === 'network_error') {
      emailRowError = result.message
    }
  }

  async function handleRemoveEmail(emailId: string) {
    emailRowError = null
    const result = await adminApi.removeEmployeeEmail(id, emailId)
    confirmRemoveEmailId = null
    if (result.kind === 'removed') {
      await refetchEmployee()
      return
    }
    if (result.kind === 'last_verified_email') {
      emailRowError = result.message
      return
    }
    if (result.kind === 'not_found') {
      emailRowError = 'Email row not found.'
      return
    }
    if (result.kind === 'network_error') {
      emailRowError = result.message
    }
  }

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
      await adminApi.upgradeEmployeeWorkspace(id, { workspaceEmail })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['employees', id] }),
        queryClient.invalidateQueries({ queryKey: ['employees'] }),
      ])
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
        <p class="text-sm text-muted-foreground">{displayEmail(emp)}</p>
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
        {#if confirmingSignOutAll}
          <Button
            variant="destructive"
            size="sm"
            onclick={handleSignOutAll}
            disabled={signOutAllPending}
          >
            {signOutAllPending ? 'Signing out…' : 'Confirm sign out all'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onclick={() => { confirmingSignOutAll = false; signOutAllError = null }}
          >
            Cancel
          </Button>
        {:else}
          <Button
            variant="outline"
            size="sm"
            onclick={() => { confirmingSignOutAll = true; signOutAllError = null; signOutAllResult = null }}
          >
            Sign out all sessions
          </Button>
        {/if}
      </div>
    </div>

    {#if signOutAllResult}
      <p class="text-xs text-status-active">Revoked {signOutAllResult.revoked} active session{signOutAllResult.revoked === 1 ? '' : 's'}.</p>
    {/if}
    {#if signOutAllError}
      <p class="text-xs text-destructive">{signOutAllError}</p>
    {/if}

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

        <!-- Email management moved to its own card below — see "Email addresses" -->


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

    <Card class="mt-6 max-w-lg">
      <CardContent class="space-y-4 pt-6">
        <div>
          <h2 class="text-base font-semibold">Email addresses</h2>
          <p class="text-xs text-muted-foreground">
            Workspace emails sign in with Google. Personal emails sign in with a code. Admin-entered emails are trusted on entry.
          </p>
        </div>

        {#if emp.emails && emp.emails.length > 0}
          <ul class="divide-y divide-border">
            {#each emp.emails as entry (entry.emailId ?? entry.address)}
              <li class="flex items-start justify-between gap-4 py-3">
                <div class="min-w-0 space-y-1">
                  {#if editingEmailId === entry.emailId}
                    <Input type="email" bind:value={editEmailValue} class="w-full" />
                  {:else}
                    <div class="flex items-center gap-2">
                      <span class="truncate text-sm font-medium">{entry.address}</span>
                      {#if entry.isPrimary}
                        <span class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">Primary</span>
                      {/if}
                    </div>
                    <div class="flex items-center gap-2 text-xs text-muted-foreground">
                      <span class="rounded-full bg-muted px-2 py-0.5">
                        {entry.kind === 'workspace' ? 'Workspace' : 'Personal'}
                      </span>
                      {#if entry.verified}
                        <span class="text-status-active">✓ Verified</span>
                      {:else}
                        <span class="text-status-pending">Unverified</span>
                      {/if}
                      {#if entry.addedBy}
                        <span class="text-[10px]">added by {entry.addedBy}</span>
                      {/if}
                    </div>
                  {/if}
                </div>
                <div class="flex items-center gap-2">
                  {#if editingEmailId === entry.emailId}
                    <Button size="sm" onclick={() => entry.emailId && handleSaveEditEmail(entry.emailId)}>Save</Button>
                    <Button size="sm" variant="outline" onclick={() => { editingEmailId = null; emailRowError = null }}>Cancel</Button>
                  {:else}
                    {#if !entry.isPrimary && entry.verified}
                      <Button
                        size="sm"
                        variant="outline"
                        onclick={() => entry.emailId && handleSetEmailPrimaryAdmin(entry.emailId)}
                      >
                        Set primary
                      </Button>
                    {/if}
                    <Button
                      size="sm"
                      variant="ghost"
                      onclick={() => { editingEmailId = entry.emailId ?? null; editEmailValue = entry.address; emailRowError = null }}
                    >
                      Edit
                    </Button>
                    {#if confirmRemoveEmailId === entry.emailId}
                      <Button
                        size="sm"
                        variant="destructive"
                        onclick={() => entry.emailId && handleRemoveEmail(entry.emailId)}
                      >
                        Confirm
                      </Button>
                      <Button size="sm" variant="outline" onclick={() => { confirmRemoveEmailId = null }}>Cancel</Button>
                    {:else}
                      <Button
                        size="sm"
                        variant="ghost"
                        onclick={() => { confirmRemoveEmailId = entry.emailId ?? null; emailRowError = null }}
                      >
                        Remove
                      </Button>
                    {/if}
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-sm text-muted-foreground">No email addresses on file.</p>
        {/if}

        {#if emailRowError}
          <p class="text-xs text-destructive">{emailRowError}</p>
        {/if}

        <div class="space-y-2 border-t border-border pt-3">
          <p class="text-xs font-medium">Add an email</p>
          <div class="flex flex-wrap items-center gap-2">
            <Select
              type="single"
              value={addEmailKind}
              onValueChange={(v) => { if (v) addEmailKind = v as 'workspace' | 'personal' }}
            >
              <SelectTrigger size="sm" class="w-32">
                <span>{addEmailKind === 'workspace' ? 'Workspace' : 'Personal'}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal" label="Personal" />
                <SelectItem value="workspace" label="Workspace" />
              </SelectContent>
            </Select>
            <Input
              type="email"
              placeholder={addEmailKind === 'workspace' ? 'name@ahacommerce.net' : 'name@gmail.com'}
              bind:value={addEmailValue}
              class="flex-1 min-w-[180px]"
            />
            <Button size="sm" onclick={handleAddEmail} disabled={addEmailPending}>
              {addEmailPending ? 'Adding…' : 'Add'}
            </Button>
          </div>
          {#if addEmailError}
            <p class="text-xs text-destructive">{addEmailError}</p>
          {/if}
        </div>
      </CardContent>
    </Card>

    {#if canIssueOneTimeLoginLinks}
      <Card class="mt-6 max-w-lg border-warning/40">
        <CardContent class="space-y-4 pt-6">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-base font-semibold">One-time login link</h2>
              <p class="text-xs text-muted-foreground">
                Recovery tool — bypasses email verification. Hand the URL to the user out-of-band.
                5-minute TTL, single-use, audit-logged.
              </p>
            </div>
            <Button size="sm" variant="outline" onclick={openLinkModal}>Issue link</Button>
          </div>

          <div>
            <p class="mb-1 text-xs font-medium text-muted-foreground">Past issuances</p>
            {#if linkHistoryLoading}
              <p class="text-xs text-muted-foreground">Loading…</p>
            {:else if linkHistory.length === 0}
              <p class="text-xs text-muted-foreground">No past one-time links for this user.</p>
            {:else}
              <ul class="divide-y divide-border text-xs">
                {#each linkHistory as link (link.id)}
                  <li class="flex items-start justify-between gap-3 py-2">
                    <div class="min-w-0">
                      <p class="font-medium">{link.reason}</p>
                      {#if link.reasonText}
                        <p class="text-muted-foreground">{link.reasonText}</p>
                      {/if}
                      <p class="text-muted-foreground">
                        Issued by {link.issuedBy.name} ·
                        {new Date(link.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div class="text-right">
                      {#if link.consumedAt}
                        <span class="rounded-full bg-status-active/10 px-2 py-0.5 text-status-active">
                          Used {new Date(link.consumedAt).toLocaleString()}
                        </span>
                      {:else if new Date(link.expiresAt) < new Date()}
                        <span class="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Expired</span>
                      {:else}
                        <span class="rounded-full bg-status-pending/10 px-2 py-0.5 text-status-pending">
                          Active until {new Date(link.expiresAt).toLocaleTimeString()}
                        </span>
                      {/if}
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        </CardContent>
      </Card>
    {/if}
  {:else}
    <p class="text-sm text-muted-foreground">Employee not found.</p>
  {/if}

  <a href="/admin/employees" class="mt-6 inline-block text-xs text-primary hover:text-primary/80">&larr; Back to employees</a>
</div>

{#if showLinkModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
    <div class="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
      {#if linkResult}
        <h2 class="mb-2 text-lg font-semibold">Login link ready</h2>
        <p class="mb-4 text-xs text-muted-foreground">
          Share this URL with the user via a trusted out-of-band channel (chat, phone). It is single-use and expires
          {new Date(linkResult.expiresAt).toLocaleTimeString()}.
        </p>
        <div class="mb-3 break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
          {linkResult.url}
        </div>
        <div class="flex justify-end gap-2">
          <Button variant="outline" size="sm" onclick={copyLinkUrl}>
            {linkCopied ? 'Copied!' : 'Copy URL'}
          </Button>
          <Button size="sm" onclick={closeLinkModal}>Close</Button>
        </div>
      {:else}
        <h2 class="mb-4 text-lg font-semibold">Issue one-time login link</h2>
        <form
          onsubmit={(e) => { e.preventDefault(); handleIssueLink() }}
          class="space-y-3"
        >
          <div>
            <label for="link-reason" class="mb-1 block text-xs text-muted-foreground">Reason</label>
            <select
              id="link-reason"
              bind:value={linkReason}
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {#each Object.entries(REASON_LABELS) as [val, label]}
                <option value={val}>{label}</option>
              {/each}
            </select>
          </div>
          <div>
            <label for="link-reason-text" class="mb-1 block text-xs text-muted-foreground">
              Justification (recorded in audit log)
            </label>
            <textarea
              id="link-reason-text"
              bind:value={linkReasonText}
              rows="3"
              maxlength="1000"
              required
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="e.g., user reports OTP inbox compromised; verbal confirmation via phone."
            ></textarea>
          </div>
          {#if linkError}
            <p class="text-xs text-destructive">{linkError}</p>
          {/if}
          <div class="flex justify-end gap-2">
            <Button type="button" variant="outline" onclick={closeLinkModal}>Cancel</Button>
            <Button type="submit" disabled={linkPending}>
              {linkPending ? 'Issuing…' : 'Issue link'}
            </Button>
          </div>
        </form>
      {/if}
    </div>
  </div>
{/if}
