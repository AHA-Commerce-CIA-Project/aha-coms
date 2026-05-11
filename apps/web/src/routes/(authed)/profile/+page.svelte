<script lang="ts">
  import { getContext, onMount } from 'svelte'
  import type { SessionUser } from '$lib/auth'
  import {
    fetchUserinfo,
    addPersonalEmail,
    verifyOwnedEmail,
    resendOwnedEmailOtp,
    setEmailPrimary,
    removeOwnedEmail,
    type UserinfoEmailEntry,
    type UserinfoResponse,
  } from '$lib/auth'
  import { PORTAL_ROLE_LABELS } from '@coms-portal/shared'
  import { Button, Input, Label, Card, CardContent } from '@coms-portal/ui-svelte/primitives'
  import {
    listSessions,
    revokeSessionById,
    signOutAllOtherDevices,
    formatRelativeFromNow,
    authMethodLabel,
    type ActiveSession,
  } from '$lib/sessions'

  const getUser = getContext<() => SessionUser | null>('user')
  const user = $derived(getUser())

  let userinfo = $state<UserinfoResponse | null>(null)
  let loading = $state(true)

  // ----- Active sessions panel state (Spec 06 PR E §10) ---------------------
  let sessions = $state<ActiveSession[]>([])
  let sessionsLoading = $state(true)
  let sessionsError = $state<string | null>(null)
  let sessionRowBusy = $state<string | null>(null)
  let signOutOthersBusy = $state(false)

  async function refreshUserinfo() {
    userinfo = await fetchUserinfo()
  }

  async function refreshSessions() {
    sessionsError = null
    const result = await listSessions()
    if (result.kind === 'ok') {
      sessions = result.sessions
    } else {
      sessionsError = 'Could not load sessions.'
    }
  }

  async function handleRevokeSession(id: string) {
    sessionRowBusy = id
    sessionsError = null
    const result = await revokeSessionById(id)
    sessionRowBusy = null
    if (result.kind === 'revoked') {
      if (result.clearedCookie) {
        // Caller signed out their own current session — bounce to login.
        window.location.assign('/login')
        return
      }
      await refreshSessions()
    } else if (result.kind === 'not_found') {
      // Already gone — refresh quietly.
      await refreshSessions()
    } else {
      sessionsError = 'Network error. Try again.'
    }
  }

  async function handleSignOutOthers() {
    signOutOthersBusy = true
    sessionsError = null
    const result = await signOutAllOtherDevices()
    signOutOthersBusy = false
    if (result.kind === 'ok') {
      await refreshSessions()
    } else {
      sessionsError = 'Network error. Try again.'
    }
  }

  onMount(async () => {
    await Promise.all([refreshUserinfo(), refreshSessions()])
    loading = false
    sessionsLoading = false
  })

  // ----------- Add personal email + verify modal state -----------------------
  let showAddModal = $state(false)
  let addStep = $state<'email' | 'otp'>('email')
  let addEmail = $state('')
  let addEmailId = $state<string | null>(null)
  let addCode = $state('')
  let addError = $state<string | null>(null)
  let addInfo = $state<string | null>(null)
  let addBusy = $state(false)
  let resendCountdown = $state(0)
  let resendTimer: ReturnType<typeof setInterval> | null = null
  let attemptsRemaining = $state<number | null>(null)

  function startResendCountdown() {
    resendCountdown = 60
    if (resendTimer) clearInterval(resendTimer)
    resendTimer = setInterval(() => {
      resendCountdown -= 1
      if (resendCountdown <= 0 && resendTimer) {
        clearInterval(resendTimer)
        resendTimer = null
      }
    }, 1000)
  }

  function closeAddModal() {
    showAddModal = false
    addStep = 'email'
    addEmail = ''
    addEmailId = null
    addCode = ''
    addError = null
    addInfo = null
    addBusy = false
    attemptsRemaining = null
    if (resendTimer) {
      clearInterval(resendTimer)
      resendTimer = null
    }
    resendCountdown = 0
  }

  async function handleAddSubmit() {
    addError = null
    addBusy = true
    const result = await addPersonalEmail(addEmail)
    addBusy = false
    if (result.kind === 'added') {
      addEmailId = result.emailId
      addStep = 'otp'
      addInfo = result.message || 'A verification code was sent.'
      startResendCountdown()
      return
    }
    if (result.kind === 'email_in_use') {
      addError = result.message || 'This email cannot be added.'
      return
    }
    addError = 'Network error. Please try again.'
  }

  async function handleVerifySubmit() {
    if (!addEmailId) return
    addError = null
    addBusy = true
    const result = await verifyOwnedEmail(addEmailId, addCode.replace(/\D/g, ''))
    addBusy = false
    if (result.kind === 'verified') {
      await refreshUserinfo()
      closeAddModal()
      return
    }
    if (result.kind === 'invalid_or_expired') {
      attemptsRemaining = result.attemptsRemaining
      addError =
        result.attemptsRemaining === 0
          ? 'This code is no longer valid. Please request a new one.'
          : 'Incorrect or expired code.'
      return
    }
    if (result.kind === 'email_not_found') {
      addError = 'This email row was not found. Please start again.'
      return
    }
    addError = 'Network error. Please try again.'
  }

  async function handleResend() {
    if (!addEmailId || resendCountdown > 0) return
    addError = null
    const result = await resendOwnedEmailOtp(addEmailId)
    if (result.kind === 'sent') {
      addInfo = result.message || 'A new code was sent.'
      startResendCountdown()
      return
    }
    if (result.kind === 'rate_limited') {
      resendCountdown = result.retryAfter ?? 60
      addError = result.message
      return
    }
    addError = 'Could not resend. Please try again.'
  }

  // OTP input — strip non-digits live, auto-submit at 6
  function onOtpInput(e: Event) {
    const target = e.target as HTMLInputElement
    const cleaned = target.value.replace(/\D/g, '').slice(0, 6)
    addCode = cleaned
    if (cleaned.length === 6 && !addBusy) {
      void handleVerifySubmit()
    }
  }

  // ----------- Per-row actions -----------------------------------------------
  let rowBusy = $state<string | null>(null)
  let rowError = $state<string | null>(null)
  let confirmRemoveId = $state<string | null>(null)

  async function handleSetPrimary(emailId: string) {
    rowBusy = emailId
    rowError = null
    const result = await setEmailPrimary(emailId)
    rowBusy = null
    if (result.kind === 'set') {
      await refreshUserinfo()
      return
    }
    if (result.kind === 'not_verified') {
      rowError = result.message
      return
    }
    if (result.kind === 'email_not_found') {
      rowError = 'Email not found.'
      return
    }
    rowError = 'Network error.'
  }

  async function handleRemove(emailId: string) {
    rowBusy = emailId
    rowError = null
    const result = await removeOwnedEmail(emailId)
    rowBusy = null
    confirmRemoveId = null
    if (result.kind === 'removed') {
      await refreshUserinfo()
      return
    }
    if (result.kind === 'last_verified_email' || result.kind === 'workspace_kind_forbidden') {
      rowError = result.message
      return
    }
    if (result.kind === 'email_not_found') {
      rowError = 'Email not found.'
      return
    }
    rowError = 'Network error.'
  }

  function kindLabel(kind: UserinfoEmailEntry['kind']): string {
    return kind === 'workspace' ? 'Workspace' : 'Personal'
  }

  function canRemove(entry: UserinfoEmailEntry): boolean {
    if (entry.kind === 'workspace') return false
    if (!userinfo) return false
    const verifiedCount = userinfo.emails.filter((e) => e.verified).length
    if (entry.verified && verifiedCount <= 1) return false
    return true
  }
</script>

<div class="p-8">
  <div class="mb-6">
    <h1 class="text-xl font-semibold">Profile</h1>
    <p class="mt-1 text-sm text-muted-foreground">Your account information</p>
  </div>

  {#if user}
    <div class="max-w-2xl space-y-3 rounded-xl border border-border bg-card p-6">
      <div class="mb-4 flex items-center gap-4">
        <div class="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-lg font-semibold">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p class="font-medium">{user.name}</p>
          <p class="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <div class="flex justify-between border-b border-border pb-2">
        <span class="text-xs text-muted-foreground">Name</span>
        <span class="text-sm">{user.name}</span>
      </div>
      <div class="flex justify-between border-b border-border pb-2">
        <span class="text-xs text-muted-foreground">Role</span>
        <span class="rounded-full bg-muted px-2 py-0.5 text-xs">{PORTAL_ROLE_LABELS[user.portalRole] ?? user.portalRole}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-xs text-muted-foreground">App Access</span>
        <span class="text-sm text-foreground">{user.apps.length} app{user.apps.length !== 1 ? 's' : ''}</span>
      </div>
    </div>

    {#if user.apps.length > 0}
      <div class="mt-4 max-w-2xl">
        <p class="mb-2 text-xs text-muted-foreground">Accessible Apps</p>
        <div class="flex flex-wrap gap-2">
          {#each user.apps as appSlug}
            <span class="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">{appSlug}</span>
          {/each}
        </div>
      </div>
    {/if}

    <Card class="mt-6 max-w-2xl">
      <CardContent class="space-y-4 pt-6">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-base font-semibold">Email addresses</h2>
            <p class="text-xs text-muted-foreground">Sign in with any verified email. The primary email is shown to other apps.</p>
          </div>
          <Button size="sm" onclick={() => { showAddModal = true }}>Add personal email</Button>
        </div>

        {#if loading}
          <p class="text-sm text-muted-foreground">Loading…</p>
        {:else if !userinfo}
          <p class="text-sm text-destructive">Could not load emails.</p>
        {:else}
          <ul class="divide-y divide-border">
            {#each userinfo.emails as entry (entry.emailId)}
              <li class="flex items-start justify-between gap-4 py-3">
                <div class="min-w-0 space-y-1">
                  <div class="flex items-center gap-2">
                    <span class="truncate text-sm font-medium">{entry.address}</span>
                    {#if entry.isPrimary}
                      <span class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">Primary</span>
                    {/if}
                  </div>
                  <div class="flex items-center gap-2 text-xs text-muted-foreground">
                    <span class="rounded-full bg-muted px-2 py-0.5">{kindLabel(entry.kind)}</span>
                    {#if entry.verified}
                      <span class="text-status-active">✓ Verified</span>
                    {:else}
                      <span class="text-status-pending">Unverified</span>
                    {/if}
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  {#if !entry.isPrimary && entry.verified}
                    <Button
                      size="sm"
                      variant="outline"
                      onclick={() => handleSetPrimary(entry.emailId)}
                      disabled={rowBusy === entry.emailId}
                    >
                      Set primary
                    </Button>
                  {/if}
                  {#if canRemove(entry)}
                    {#if confirmRemoveId === entry.emailId}
                      <Button
                        size="sm"
                        variant="destructive"
                        onclick={() => handleRemove(entry.emailId)}
                        disabled={rowBusy === entry.emailId}
                      >
                        Confirm
                      </Button>
                      <Button size="sm" variant="outline" onclick={() => { confirmRemoveId = null }}>Cancel</Button>
                    {:else}
                      <Button size="sm" variant="ghost" onclick={() => { confirmRemoveId = entry.emailId; rowError = null }}>
                        Remove
                      </Button>
                    {/if}
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
          {#if rowError}
            <p class="text-xs text-destructive">{rowError}</p>
          {/if}
        {/if}
      </CardContent>
    </Card>

    <Card class="mt-6 max-w-2xl">
      <CardContent class="space-y-4 pt-6">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-base font-semibold">Active sessions</h2>
            <p class="text-xs text-muted-foreground">Devices currently signed in to your portal account.</p>
          </div>
          {#if sessions.filter((s) => !s.isCurrent).length > 0}
            <Button
              size="sm"
              variant="outline"
              onclick={handleSignOutOthers}
              disabled={signOutOthersBusy}
            >
              {signOutOthersBusy ? 'Signing out…' : 'Sign out all other devices'}
            </Button>
          {/if}
        </div>

        {#if sessionsLoading}
          <p class="text-sm text-muted-foreground">Loading…</p>
        {:else if sessionsError}
          <p class="text-sm text-destructive">{sessionsError}</p>
        {:else if sessions.length === 0}
          <p class="text-sm text-muted-foreground">No active sessions.</p>
        {:else}
          <ul class="divide-y divide-border">
            {#each sessions as s (s.id)}
              <li class="flex items-start justify-between gap-4 py-3">
                <div class="min-w-0 space-y-1">
                  <div class="flex items-center gap-2">
                    <span class="truncate text-sm font-medium">
                      {s.deviceLabel ?? 'Unknown device'}
                    </span>
                    {#if s.isCurrent}
                      <span class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        This device
                      </span>
                    {/if}
                  </div>
                  <div class="flex items-center gap-2 text-xs text-muted-foreground">
                    <span class="rounded-full bg-muted px-2 py-0.5">{authMethodLabel(s.authMethod)}</span>
                    <span>Started {formatRelativeFromNow(s.createdAt)}</span>
                    {#if s.ipAddress}
                      <span aria-hidden="true">·</span>
                      <span class="font-mono">{s.ipAddress}</span>
                    {/if}
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={s.isCurrent ? 'destructive' : 'ghost'}
                    onclick={() => handleRevokeSession(s.id)}
                    disabled={sessionRowBusy === s.id}
                  >
                    {sessionRowBusy === s.id ? 'Signing out…' : s.isCurrent ? 'Sign out this device' : 'Sign out'}
                  </Button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </CardContent>
    </Card>
  {:else}
    <p class="text-sm text-muted-foreground">Could not load profile.</p>
  {/if}
</div>

{#if showAddModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
    <div class="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
      {#if addStep === 'email'}
        <h2 class="mb-4 text-lg font-semibold">Add a personal email</h2>
        <form onsubmit={(e) => { e.preventDefault(); handleAddSubmit() }} class="space-y-3">
          <div>
            <Label for="add-email" class="mb-1 block text-xs text-muted-foreground">Email address</Label>
            <Input id="add-email" type="email" autocomplete="email" required bind:value={addEmail} class="w-full" />
          </div>
          {#if addError}
            <p class="text-xs text-destructive">{addError}</p>
          {/if}
          <div class="flex justify-end gap-2">
            <Button type="button" variant="outline" onclick={closeAddModal}>Cancel</Button>
            <Button type="submit" disabled={addBusy}>{addBusy ? 'Sending…' : 'Send code'}</Button>
          </div>
        </form>
      {:else}
        <h2 class="mb-2 text-lg font-semibold">Enter the code we sent to {addEmail}</h2>
        <p class="mb-4 text-xs text-muted-foreground">Open your inbox and enter the 6-digit code.</p>
        {#if addInfo && !addError}
          <p class="mb-3 text-xs text-status-active">{addInfo}</p>
        {/if}
        <form onsubmit={(e) => { e.preventDefault(); handleVerifySubmit() }} class="space-y-3">
          <div>
            <Label for="add-code" class="mb-1 block text-xs text-muted-foreground">Verification code</Label>
            <input
              id="add-code"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              pattern="\d{6}"
              maxlength="6"
              required
              value={addCode}
              oninput={onOtpInput}
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-center text-lg font-mono tracking-[0.5em] tabular-nums"
            />
          </div>
          {#if attemptsRemaining !== null && attemptsRemaining > 0 && addError}
            <p class="text-xs text-muted-foreground">{attemptsRemaining} attempt{attemptsRemaining === 1 ? '' : 's'} remaining.</p>
          {/if}
          {#if addError}
            <p class="text-xs text-destructive">{addError}</p>
          {/if}
          <div class="flex items-center justify-between gap-2">
            <button
              type="button"
              class="text-xs underline disabled:cursor-not-allowed disabled:no-underline disabled:text-muted-foreground"
              onclick={handleResend}
              disabled={resendCountdown > 0 || addBusy}
            >
              {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend code'}
            </button>
            <div class="flex gap-2">
              <Button type="button" variant="outline" onclick={closeAddModal}>Cancel</Button>
              <Button type="submit" disabled={addBusy || addCode.length < 6}>
                {addBusy ? 'Verifying…' : 'Verify'}
              </Button>
            </div>
          </div>
        </form>
      {/if}
    </div>
  </div>
{/if}
