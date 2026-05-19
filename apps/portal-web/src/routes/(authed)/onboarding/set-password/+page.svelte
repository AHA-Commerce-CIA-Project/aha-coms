<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation'
  import { page } from '$app/stores'
  import { base } from '$app/paths'
  import { setPassword } from '$lib/auth'
  import { Card, CardHeader, CardTitle, CardContent, Button, Input, Label } from '@coms-portal/ui-svelte/primitives'
  import { Eye, EyeOff } from '@lucide/svelte'
  import PasswordStrengthMeter from '$lib/components/password-strength-meter.svelte'

  let newPassword = $state('')
  let confirmPassword = $state('')
  // Two independent toggles — peeking at the new password without exposing
  // confirm (or vice-versa) helps users verify the two fields actually match
  // without revealing both at once on a shared screen.
  let showNew = $state(false)
  let showConfirm = $state(false)
  let submitting = $state(false)
  let error = $state<string | null>(null)

  const redirectTo = $derived(
    $page.url.searchParams.get('redirectTo') ?? `${base}/dashboard`,
  )

  const matches = $derived(
    confirmPassword.length === 0 || newPassword === confirmPassword,
  )

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    error = null
    if (newPassword !== confirmPassword) {
      error = 'Passwords do not match.'
      return
    }
    submitting = true
    try {
      const result = await setPassword(newPassword)
      switch (result.kind) {
        case 'ok':
          // Re-fetch the session payload so passwordSetupRequired flips back
          // to false before the redirect.
          await invalidateAll()
          await goto(redirectTo)
          return
        case 'weak_password':
          error = result.message || 'Password does not meet the policy.'
          return
        case 'current_password_required':
          error = 'This account already has a password. Use the change-password flow from your profile.'
          return
        case 'current_password_invalid':
          error = 'Current password is incorrect.'
          return
        case 'network_error':
          error = result.message || 'Something went wrong. Please try again.'
          return
      }
    } finally {
      submitting = false
    }
  }
</script>

<div class="flex min-h-screen items-center justify-center bg-muted/40 p-6">
  <Card class="w-full max-w-md">
    <CardHeader>
      <CardTitle>Set a password to continue</CardTitle>
    </CardHeader>
    <CardContent>
      <p class="mb-4 text-sm text-muted-foreground">
        This is a one-time setup. After you choose a password, you can sign in with email + password
        in addition to the existing options.
      </p>

      <form onsubmit={handleSubmit} class="space-y-4">
        <div>
          <Label for="onboarding-new-password" class="mb-1 block text-xs text-muted-foreground">
            New password
          </Label>
          <div class="relative">
            <Input
              id="onboarding-new-password"
              type={showNew ? 'text' : 'password'}
              bind:value={newPassword}
              required
              minlength={8}
              maxlength={256}
              autocomplete="new-password"
              class="w-full pr-9"
            />
            <button
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onclick={() => (showNew = !showNew)}
              aria-label={showNew ? 'Hide password' : 'Show password'}
              tabindex={-1}
            >
              {#if showNew}
                <EyeOff class="size-4" />
              {:else}
                <Eye class="size-4" />
              {/if}
            </button>
          </div>
          <PasswordStrengthMeter
            password={newPassword}
            userInputs={[$page.data.user?.email ?? '', $page.data.user?.name ?? '']}
          />
        </div>

        <div>
          <Label for="onboarding-confirm-password" class="mb-1 block text-xs text-muted-foreground">
            Confirm password
          </Label>
          <div class="relative">
            <Input
              id="onboarding-confirm-password"
              type={showConfirm ? 'text' : 'password'}
              bind:value={confirmPassword}
              required
              minlength={8}
              maxlength={256}
              autocomplete="new-password"
              class="w-full pr-9"
            />
            <button
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onclick={() => (showConfirm = !showConfirm)}
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
              tabindex={-1}
            >
              {#if showConfirm}
                <EyeOff class="size-4" />
              {:else}
                <Eye class="size-4" />
              {/if}
            </button>
          </div>
          {#if !matches}
            <p class="mt-1 text-[10px] text-rose-500">Passwords do not match yet.</p>
          {/if}
        </div>

        {#if error}
          <p class="text-xs text-rose-500">{error}</p>
        {/if}

        <Button type="submit" disabled={submitting || !matches || newPassword.length === 0} class="w-full">
          {submitting ? 'Saving…' : 'Save password and continue'}
        </Button>
      </form>
    </CardContent>
  </Card>
</div>
