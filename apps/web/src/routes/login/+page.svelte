<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import {
    signInWithPopup,
    signInWithEmailAndPassword,
    signOut,
    getIdToken,
  } from 'firebase/auth'
  import { clientAuth, googleProvider } from '$lib/firebase'
  import { api } from '$lib/api'
  import { readHandoffIntent, stashIntent, popStashedIntent, navigateToLaunch } from '$lib/portal-handoff'
  import { onMount } from 'svelte'

  let email = $state('')
  let password = $state('')
  let error = $state<string | null>(null)
  let loading = $state(false)

  const redirectTo = $derived($page.url.searchParams.get('redirect') ?? '/')

  onMount(() => {
    const intent = readHandoffIntent($page.url)
    if (intent) stashIntent(intent)
  })

  async function exchangeToken(idToken: string) {
    const { error: err } = await api.api.auth.session.post({ idToken })
    if (err) throw new Error((err.value as { message?: string })?.message ?? 'Login failed')
    const intent = popStashedIntent()
    if (intent) {
      navigateToLaunch(intent)
    } else {
      await goto(redirectTo)
    }
  }

  async function handleGoogle() {
    error = null
    loading = true
    try {
      const cred = await signInWithPopup(clientAuth, googleProvider)
      const idToken = await getIdToken(cred.user)
      await exchangeToken(idToken)
    } catch (e) {
      await signOut(clientAuth).catch(() => {})
      error = e instanceof Error ? e.message : 'Google sign-in failed'
    } finally {
      loading = false
    }
  }

  async function handleEmail(e: SubmitEvent) {
    e.preventDefault()
    error = null
    loading = true
    try {
      const cred = await signInWithEmailAndPassword(clientAuth, email, password)
      const idToken = await getIdToken(cred.user)
      await exchangeToken(idToken)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Sign-in failed'
    } finally {
      loading = false
    }
  }
</script>

<div class="flex min-h-full items-center justify-center px-4">
  <div class="w-full max-w-sm space-y-8">
    <div class="text-center">
      <h1 class="text-2xl font-semibold tracking-tight">COMS Portal</h1>
      <p class="mt-1 text-sm text-neutral-400">Sign in to continue</p>
    </div>

    <button
      onclick={handleGoogle}
      disabled={loading}
      class="flex w-full items-center justify-center gap-3 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm font-medium hover:bg-neutral-800 disabled:opacity-50"
    >
      <svg class="h-5 w-5" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Continue with Google
    </button>

    <div class="relative">
      <div class="absolute inset-0 flex items-center">
        <div class="w-full border-t border-neutral-800"></div>
      </div>
      <div class="relative flex justify-center text-xs text-neutral-500">
        <span class="bg-neutral-950 px-2">or</span>
      </div>
    </div>

    <form onsubmit={handleEmail} class="space-y-4">
      <div>
        <label for="login-email" class="mb-1 block text-xs text-neutral-400">Email</label>
        <input
          id="login-email"
          type="email"
          bind:value={email}
          required
          class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <div>
        <label for="login-password" class="mb-1 block text-xs text-neutral-400">Password</label>
        <input
          id="login-password"
          type="password"
          bind:value={password}
          required
          class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>
      {#if error}
        <p class="text-xs text-red-400">{error}</p>
      {/if}
      <button
        type="submit"
        disabled={loading}
        class="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
      >
        Sign in
      </button>
    </form>

    <p class="text-center text-xs text-neutral-500">
      <a href="/forgot-password" class="text-indigo-400 hover:text-indigo-300">Forgot password?</a>
    </p>
  </div>
</div>
