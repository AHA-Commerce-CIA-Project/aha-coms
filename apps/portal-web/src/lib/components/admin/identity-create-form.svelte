<script lang="ts">
  import { adminApi } from '$lib/admin-api'
  import { Button, Input, Label } from '@coms-portal/ui-svelte/primitives'
  import { Eye, EyeOff } from '@lucide/svelte'
  import { PASSWORD_MIN_LENGTH } from '@coms-portal/shared'
  import PasswordStrengthMeter from '$lib/components/password-strength-meter.svelte'

  let { onCreated }: { onCreated?: () => void } = $props()

  let name = $state('')
  let email = $state('')
  let password = $state('')
  let notes = $state('')
  let showPassword = $state(false)
  let submitting = $state(false)
  let error = $state<string | null>(null)
  let success = $state<string | null>(null)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    error = null
    success = null
    submitting = true
    try {
      const result = await adminApi.createIdentity({
        name: name.trim(),
        email: email.trim(),
        password,
        notes: notes.trim() || undefined,
      })
      switch (result.kind) {
        case 'created':
          success = `Identity created (${email.trim()}).`
          name = ''
          email = ''
          password = ''
          notes = ''
          onCreated?.()
          break
        case 'weak_password':
          error = result.message || 'Password does not meet the policy.'
          break
        case 'duplicate_email':
          error = `That email is already registered (${result.message}).`
          break
        case 'forbidden':
          error = 'You do not have permission to create identities.'
          break
        case 'network_error':
          error = result.message
          break
      }
    } finally {
      submitting = false
    }
  }
</script>

<form onsubmit={handleSubmit} class="space-y-4">
  <div>
    <Label for="identity-name" class="mb-1 block text-xs text-muted-foreground">Name</Label>
    <Input id="identity-name" type="text" bind:value={name} required minlength={1} maxlength={255} class="w-full" />
  </div>

  <div>
    <Label for="identity-email" class="mb-1 block text-xs text-muted-foreground">Email</Label>
    <Input
      id="identity-email"
      type="email"
      placeholder="tools-bot@internal or admin@gmail.com"
      bind:value={email}
      required
      maxlength={255}
      class="w-full"
    />
    <p class="mt-1 text-[10px] text-muted-foreground">
      Any RFC-5322-valid address. No deliverability check — the address may be a real mailbox or a stub.
    </p>
  </div>

  <div>
    <Label for="identity-password" class="mb-1 block text-xs text-muted-foreground">Password</Label>
    <div class="relative">
      <Input
        id="identity-password"
        type={showPassword ? 'text' : 'password'}
        bind:value={password}
        required
        minlength={PASSWORD_MIN_LENGTH}
        maxlength={256}
        autocomplete="new-password"
        class="w-full pr-9"
      />
      <button
        type="button"
        class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        onclick={() => (showPassword = !showPassword)}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
      >
        {#if showPassword}
          <EyeOff class="size-4" />
        {:else}
          <Eye class="size-4" />
        {/if}
      </button>
    </div>
    <PasswordStrengthMeter {password} userInputs={[name, email]} />
    <p class="mt-1 text-[10px] text-muted-foreground">
      Minimum {PASSWORD_MIN_LENGTH} characters. No composition rules — the strength meter flags weak patterns. Server enforces the minimum.
    </p>
  </div>

  <div>
    <Label for="identity-notes" class="mb-1 block text-xs text-muted-foreground">Notes (optional)</Label>
    <Input id="identity-notes" type="text" bind:value={notes} maxlength={2000} class="w-full" />
    <p class="mt-1 text-[10px] text-muted-foreground">
      Audit-trail context — who this credential is for and why.
    </p>
  </div>

  {#if error}
    <p class="text-xs text-rose-500">{error}</p>
  {/if}
  {#if success}
    <p class="text-xs text-emerald-500">{success}</p>
  {/if}

  <Button type="submit" disabled={submitting}>
    {submitting ? 'Creating…' : 'Create identity'}
  </Button>
</form>
