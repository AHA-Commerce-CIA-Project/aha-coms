<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import {
    signInWithPopup,
    signInWithEmailAndPassword,
    signOut,
    getIdToken,
  } from 'firebase/auth'
  import { Eye, EyeOff } from 'lucide-svelte'
  import { clientAuth, googleProvider } from '$lib/firebase'
  import { api } from '$lib/api'
  import { readHandoffIntent, stashIntent, popStashedIntent, navigateToLaunch } from '$lib/portal-handoff'
  import { onMount } from 'svelte'
  import StarField from '$lib/components/login/StarField.svelte'
  import { Input, Label, Button } from '@coms-portal/ui/primitives'

  let email = $state('')
  let password = $state('')
  let error = $state<string | null>(null)
  let loading = $state(false)
  let showPassword = $state(false)

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

<div class="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0e2a]">
  <StarField />

  <div class="login-stars pointer-events-none absolute inset-0" aria-hidden="true"></div>
  <div
    class="login-glow pointer-events-none absolute left-[35%] top-1/2 h-[80vh] w-[80vh] -translate-x-1/2 -translate-y-1/2 rounded-full"
    aria-hidden="true"
  ></div>

  <main class="relative z-10 flex w-full max-w-6xl flex-col items-center justify-between gap-8 px-6 md:flex-row md:gap-12 lg:px-8">

    <div class="hidden flex-1 flex-col text-white md:flex">
      <h1 class="login-fade-in text-4xl font-bold tracking-tight drop-shadow-md lg:text-5xl">
        Find Your AHA Moment
      </h1>
      <h2
        class="login-fade-in mt-2 text-5xl font-extrabold tracking-tight drop-shadow-lg lg:text-6xl"
        style="animation-delay: 0.15s"
      >
        AHA COMS
      </h2>
    </div>

    <div
      class="login-fade-in w-full max-w-md rounded-3xl bg-white/95 p-8 backdrop-blur-sm sm:p-10"
      style="animation-delay: 0.25s; box-shadow: var(--shadow-modal)"
    >
      <div class="mb-8 text-center">
        <div
          class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full shadow-lg"
          style="background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%)"
        >
          <svg class="h-7 w-7 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 5h-1V3H6v2H5a3 3 0 0 0 0 6h.08A6.01 6.01 0 0 0 11 14.93V17H9v2h6v-2h-2v-2.07A6.01 6.01 0 0 0 18.92 11H19a3 3 0 0 0 0-6zM5 9a1 1 0 0 1 0-2h1v2H5zm14 0h-1V7h1a1 1 0 0 1 0 2z" />
          </svg>
        </div>
        <h2 class="font-manrope text-3xl font-extrabold tracking-wide text-[#1a1a1a]">
          AHA COMS
        </h2>
        <p class="mt-1 text-sm text-gray-500">Sign in to continue</p>
      </div>

      {#if error}
        <div class="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-600 ring-1 ring-red-100">
          {error}
        </div>
      {/if}

      <Button
        type="button"
        onclick={handleGoogle}
        disabled={loading}
        variant="outline"
        class="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#3B68E5] focus:ring-offset-2 disabled:opacity-50"
      >
        <svg class="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        Continue with Google
      </Button>

      <div class="relative my-6">
        <div class="absolute inset-0 flex items-center">
          <div class="w-full border-t border-gray-200"></div>
        </div>
        <div class="relative flex justify-center text-sm">
          <span class="bg-white px-2 text-gray-500">or</span>
        </div>
      </div>

      <form onsubmit={handleEmail} class="space-y-5">
        <div>
          <Label for="login-email" class="mb-1 block text-sm font-medium text-gray-700">
            Email
          </Label>
          <Input
            id="login-email"
            type="email"
            required
            bind:value={email}
            disabled={loading}
            autocomplete="email"
            placeholder="you@aha.com"
            class="block w-full rounded-md border border-gray-300 px-4 py-3 text-sm shadow-sm placeholder-gray-400 transition-all focus:border-[#3B68E5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3B68E5]/20"
          />
        </div>

        <div>
          <Label for="login-password" class="mb-1 block text-sm font-medium text-gray-700">
            Password
          </Label>
          <div class="relative">
            <Input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              required
              bind:value={password}
              disabled={loading}
              autocomplete="current-password"
              placeholder="••••••••"
              class="block w-full rounded-md border border-gray-300 px-4 py-3 pr-10 text-sm shadow-sm placeholder-gray-400 transition-all focus:border-[#3B68E5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3B68E5]/20"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onclick={() => (showPassword = !showPassword)}
              class="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {#if showPassword}
                <EyeOff class="h-4 w-4" />
              {:else}
                <Eye class="h-4 w-4" />
              {/if}
            </Button>
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading}
          class="btn-gradient-blue w-full rounded-lg px-4 py-3 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#3B68E5] focus:ring-offset-2 disabled:opacity-50"
        >
          {#if loading}
            <span class="flex items-center justify-center gap-2">
              <svg
                class="h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Signing in…
            </span>
          {:else}
            Sign in
          {/if}
        </Button>
      </form>

      <div class="mt-4 text-center">
        <a
          href="/forgot-password"
          class="text-sm text-gray-500 transition-colors hover:text-[#3B68E5]"
        >
          Forgot password?
        </a>
      </div>
    </div>
  </main>
</div>
