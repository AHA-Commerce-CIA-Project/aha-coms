<script lang="ts">
  import { sendPasswordResetEmail } from 'firebase/auth'
  import { clientAuth } from '$lib/firebase'
  import { Input, Label, Button } from '@coms-portal/ui/primitives'

  let email = $state('')
  let sent = $state(false)
  let error = $state<string | null>(null)
  let loading = $state(false)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    error = null
    loading = true
    try {
      await sendPasswordResetEmail(clientAuth, email)
      sent = true
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to send reset email'
    } finally {
      loading = false
    }
  }
</script>

<div class="flex min-h-full items-center justify-center px-4">
  <div class="w-full max-w-sm space-y-6">
    <div class="text-center">
      <h1 class="text-2xl font-semibold tracking-tight">Reset Password</h1>
      <p class="mt-1 text-sm text-neutral-400">Enter your email to receive a reset link</p>
    </div>

    {#if sent}
      <p class="rounded-lg border border-green-800 bg-green-950 px-4 py-3 text-sm text-green-300">
        Reset link sent to {email}. Check your inbox.
      </p>
    {:else}
      <form onsubmit={handleSubmit} class="space-y-4">
        <div>
          <Label for="forgot-password-email" class="mb-1 block text-xs text-neutral-400">Email</Label>
          <Input
            id="forgot-password-email"
            type="email"
            bind:value={email}
            required
            class="w-full"
          />
        </div>
        {#if error}
          <p class="text-xs text-red-400">{error}</p>
        {/if}
        <Button
          type="submit"
          disabled={loading}
          class="w-full"
        >
          Send reset link
        </Button>
      </form>
    {/if}

    <p class="text-center text-xs text-neutral-500">
      <a href="/login" class="text-indigo-400 hover:text-indigo-300">Back to sign in</a>
    </p>
  </div>
</div>
