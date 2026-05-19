<script lang="ts">
  import { goto } from '$app/navigation'
  import { base } from '$app/paths'
  import { page } from '$app/stores'
  import { signInWithPopup, signOut, getIdToken } from 'firebase/auth'
  import { ArrowLeft, Eye, EyeOff } from '@lucide/svelte'
  import { clientAuth, googleProvider } from '$lib/firebase'
  import { api } from '$lib/api'
  import { requestOtp, verifyOtp, passwordSignIn, requestPasswordReset } from '$lib/auth'
  import {
    readHandoffIntent,
    stashIntent,
    popStashedIntent,
    navigateToLaunch,
  } from '$lib/portal-handoff'
  import { onMount, onDestroy } from 'svelte'
  import StarField from '$lib/components/login/StarField.svelte'
  import { Input, Label, Button } from '@coms-portal/ui-svelte/primitives'

  type Step = 'choose' | 'email' | 'otp' | 'password'
  // The user picks their sign-in method on the choose step. The email step's
  // behaviour and the routing decision after it both depend on this. Distinct
  // from the handoff `intent` used by completeLogin (app-launch redirect).
  type SignInMethod = 'code' | 'password'

  let step = $state<Step>('choose')
  let signInMethod = $state<SignInMethod>('code')
  let email = $state('')
  let otp = $state('')
  let password = $state('')
  let showPassword = $state(false)
  let error = $state<string | null>(null)
  let wrongLoginPath = $state(false)
  let inactiveUser = $state(false)
  let attemptsRemaining = $state<number | null>(null)
  let loading = $state(false)
  let resendAt = $state<number | null>(null)
  let now = $state(Date.now())
  let tickHandle: ReturnType<typeof setInterval> | null = null
  // Spec 06 PR F: drives whether the password step shows "Use code instead".
  // Set true when the server confirms OTP is possible for this email; false
  // when the server says PASSWORD_ONLY (and we know OTP is refused).
  let canFallbackToOtp = $state(false)
  let forgotSent = $state(false)

  const redirectTo = $derived($page.url.searchParams.get('redirect') ?? `${base}/dashboard`)
  const resendSecondsLeft = $derived(
    resendAt && resendAt > now ? Math.ceil((resendAt - now) / 1000) : 0,
  )
  const canResend = $derived(resendSecondsLeft === 0 && !loading && !inactiveUser)
  const verifyDisabled = $derived(
    loading
    || inactiveUser
    || attemptsRemaining === 0
    || otp.length !== 6,
  )

  onMount(() => {
    const intent = readHandoffIntent($page.url)
    if (intent) stashIntent(intent)
    tickHandle = setInterval(() => (now = Date.now()), 250)
  })

  onDestroy(() => {
    if (tickHandle) clearInterval(tickHandle)
  })

  async function completeLogin() {
    const intent = popStashedIntent()
    if (intent) navigateToLaunch(intent)
    else await goto(redirectTo)
  }

  async function exchangeFirebaseToken(idToken: string) {
    const { error: err } = await api.api.auth.session.post({ idToken })
    if (err) {
      const value = err.value as { message?: string } | undefined
      throw new Error(value?.message ?? 'Login failed')
    }
    await completeLogin()
  }

  async function handleGoogle() {
    error = null
    wrongLoginPath = false
    loading = true
    try {
      const cred = await signInWithPopup(clientAuth, googleProvider)
      const idToken = await getIdToken(cred.user)
      await exchangeFirebaseToken(idToken)
    } catch (e) {
      await signOut(clientAuth).catch(() => {})
      error = e instanceof Error ? e.message : 'Google sign-in failed'
    } finally {
      loading = false
    }
  }

  function goToEmailStep(method: SignInMethod) {
    signInMethod = method
    error = null
    wrongLoginPath = false
    step = 'email'
  }

  function backToChoose() {
    if (loading) return
    error = null
    wrongLoginPath = false
    step = 'choose'
  }

  function backToEmail() {
    if (loading) return
    otp = ''
    password = ''
    showPassword = false
    error = null
    inactiveUser = false
    attemptsRemaining = null
    resendAt = null
    canFallbackToOtp = false
    forgotSent = false
    step = 'email'
  }

  async function handleEmailSubmit(e: SubmitEvent) {
    e.preventDefault()
    error = null
    wrongLoginPath = false
    canFallbackToOtp = false
    loading = true
    try {
      // Method = password: the user explicitly chose password sign-in. Route
      // straight to the password step without a server round-trip. Workspace
      // users who picked password by mistake will see INVALID_CREDENTIALS at
      // sign-in time; they can Back out and pick Google instead.
      if (signInMethod === 'password') {
        canFallbackToOtp = true
        password = ''
        step = 'password'
        return
      }

      // Method = code: the user explicitly chose the code path. Pass
      // force_otp=true so the server doesn't divert HAS_PASSWORD identities
      // to the password step against the user's stated preference.
      const result = await requestOtp(email, { forceOtp: true })
      switch (result.kind) {
        case 'sent':
          resendAt = Date.now() + 60_000
          step = 'otp'
          return
        case 'wrong_login_path':
          wrongLoginPath = true
          error = result.message
          return
        case 'password_only':
          // OTP refused for admin-created credential bags. Bounce to password
          // step with the OTP fallback hidden — code is not an option here.
          canFallbackToOtp = false
          password = ''
          step = 'password'
          return
        case 'has_password':
          // Defensive: with force_otp=true the server should fall through to
          // 'sent' for HAS_PASSWORD identities, so this branch shouldn't fire.
          // If it ever does, surface the password step as a graceful fallback.
          canFallbackToOtp = true
          password = ''
          step = 'password'
          return
        case 'rate_limited':
          if (result.retryAfter) {
            resendAt = Date.now() + result.retryAfter * 1000
          }
          error = result.message
          return
        case 'network_error':
          error = 'Something went wrong. Please try again.'
          return
      }
    } finally {
      loading = false
    }
  }

  async function handlePasswordSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!password || loading) return
    error = null
    loading = true
    try {
      const result = await passwordSignIn(email, password)
      switch (result.kind) {
        case 'signed_in':
          await completeLogin()
          return
        case 'invalid_credentials':
          error = result.message || 'Invalid email or password.'
          password = ''
          return
        case 'inactive_user':
          inactiveUser = true
          error = result.message || 'This account is no longer active.'
          return
        case 'locked_out':
          error = result.retryAfter
            ? `${result.message} Try again in ${Math.ceil(result.retryAfter / 60)} minute(s).`
            : result.message || 'Account is locked. Try again later.'
          return
        case 'rate_limited':
          error = result.message
          return
        case 'network_error':
          error = 'Something went wrong. Please try again.'
          return
      }
    } finally {
      loading = false
    }
  }

  async function handleUseCodeInstead() {
    if (loading) return
    error = null
    loading = true
    try {
      const result = await requestOtp(email, { forceOtp: true })
      if (result.kind === 'sent') {
        resendAt = Date.now() + 60_000
        password = ''
        step = 'otp'
        return
      }
      if (result.kind === 'rate_limited') {
        if (result.retryAfter) resendAt = Date.now() + result.retryAfter * 1000
        error = result.message
        return
      }
      error = result.kind === 'network_error' ? 'Something went wrong. Please try again.' : 'Unable to send a code right now.'
    } finally {
      loading = false
    }
  }

  async function handleForgotPassword() {
    if (loading) return
    error = null
    loading = true
    try {
      await requestPasswordReset(email)
      forgotSent = true
    } finally {
      loading = false
    }
  }

  async function attemptVerify() {
    if (otp.length !== 6 || loading || inactiveUser) return
    error = null
    loading = true
    try {
      const result = await verifyOtp(email, otp)
      switch (result.kind) {
        case 'verified':
          await completeLogin()
          return
        case 'invalid_or_expired':
          attemptsRemaining = result.attemptsRemaining
          if (attemptsRemaining === 0) {
            error = 'Too many wrong attempts. Request a new code.'
          } else if (attemptsRemaining !== null) {
            error = `Code is invalid or expired (${attemptsRemaining} attempts left).`
          } else {
            error = 'Code expired or invalid. Request a new one.'
          }
          otp = ''
          return
        case 'inactive_user':
          inactiveUser = true
          error = result.message || 'This account is no longer active. Contact your administrator.'
          otp = ''
          return
        case 'network_error':
          error = 'Something went wrong. Please try again.'
          return
      }
    } finally {
      loading = false
    }
  }

  function handleVerifySubmit(e: SubmitEvent) {
    e.preventDefault()
    void attemptVerify()
  }

  function handleOtpInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement
    otp = target.value.replace(/\D/g, '').slice(0, 6)
    target.value = otp
    if (otp.length === 6 && !loading && !inactiveUser) {
      void attemptVerify()
    }
  }

  async function handleResend() {
    if (!canResend) return
    error = null
    attemptsRemaining = null
    otp = ''
    loading = true
    try {
      const result = await requestOtp(email)
      switch (result.kind) {
        case 'sent':
          resendAt = Date.now() + 60_000
          return
        case 'wrong_login_path':
          // User changed their email between request and resend? Bounce back to email step.
          wrongLoginPath = true
          error = result.message
          step = 'email'
          return
        case 'rate_limited':
          if (result.retryAfter) {
            resendAt = Date.now() + result.retryAfter * 1000
          }
          error = result.message
          return
        case 'network_error':
          error = 'Something went wrong. Please try again.'
          return
      }
    } finally {
      loading = false
    }
  }

  function clearEmailError() {
    if (error || wrongLoginPath) {
      error = null
      wrongLoginPath = false
    }
  }

  // Spec 06 PR F: workspace identities can also use password sign-in. When the
  // email-step's OTP request returns WRONG_LOGIN_PATH, surface this CTA so the
  // user can switch over without re-typing the email.
  function switchToPasswordFromWorkspaceError() {
    if (loading) return
    signInMethod = 'password'
    error = null
    wrongLoginPath = false
    canFallbackToOtp = false
    password = ''
    step = 'password'
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

      {#if step === 'choose'}
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

        <div class="space-y-3">
          <Button
            type="button"
            onclick={() => goToEmailStep('code')}
            disabled={loading}
            variant="outline"
            class="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#3B68E5] focus:ring-offset-2 disabled:opacity-50"
          >
            Sign in with email code
          </Button>

          <Button
            type="button"
            onclick={() => goToEmailStep('password')}
            disabled={loading}
            variant="outline"
            class="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#3B68E5] focus:ring-offset-2 disabled:opacity-50"
          >
            Sign in with email + password
          </Button>
        </div>
      {:else if step === 'email'}
        <Button
          type="button"
          variant="ghost"
          onclick={backToChoose}
          disabled={loading}
          class="-ml-2 mb-3 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft class="h-4 w-4" />
          Back
        </Button>
        <h3 class="mb-1 text-lg font-semibold text-[#1a1a1a]">Enter your email</h3>
        <p class="mb-5 text-sm text-gray-500">
          {#if signInMethod === 'password'}
            Enter the email for your account, then we'll ask for your password.
          {:else}
            We'll send you a one-time sign-in code.
          {/if}
        </p>

        {#if error}
          <div class="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-600 ring-1 ring-red-100">
            {error}
            {#if wrongLoginPath}
              <Button
                type="button"
                onclick={handleGoogle}
                disabled={loading}
                variant="outline"
                class="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <svg class="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Sign in with Google
              </Button>

              <Button
                type="button"
                onclick={switchToPasswordFromWorkspaceError}
                disabled={loading}
                variant="outline"
                class="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Use email + password instead
              </Button>
            {/if}
          </div>
        {/if}

        <form onsubmit={handleEmailSubmit} class="space-y-5">
          <div>
            <Label for="login-email" class="mb-1 block text-sm font-medium text-gray-700">
              Email
            </Label>
            <Input
              id="login-email"
              type="email"
              required
              bind:value={email}
              oninput={clearEmailError}
              disabled={loading}
              autocomplete="email"
              placeholder="you@example.com"
              class="block w-full rounded-md border border-gray-300 px-4 py-3 text-sm shadow-sm placeholder-gray-400 transition-all focus:border-[#3B68E5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3B68E5]/20"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            class="btn-gradient-blue w-full rounded-lg px-4 py-3 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#3B68E5] focus:ring-offset-2 disabled:opacity-50"
          >
            {#if loading}
              <span class="flex items-center justify-center gap-2">
                <svg class="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {signInMethod === 'password' ? 'Continuing…' : 'Sending…'}
              </span>
            {:else}
              {signInMethod === 'password' ? 'Continue' : 'Send code'}
            {/if}
          </Button>
        </form>
      {:else if step === 'password'}
        <Button
          type="button"
          variant="ghost"
          onclick={backToEmail}
          disabled={loading}
          class="-ml-2 mb-3 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft class="h-4 w-4" />
          Back
        </Button>
        <h3 class="mb-1 text-lg font-semibold text-[#1a1a1a]">Enter your password</h3>
        <p class="mb-5 text-sm text-gray-500">
          Signing in as <span class="font-medium text-gray-700">{email}</span>.
        </p>

        {#if error}
          <div class="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-600 ring-1 ring-red-100">
            {error}
          </div>
        {/if}
        {#if forgotSent}
          <div class="mb-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 ring-1 ring-emerald-100">
            If this email is registered, you'll receive a password-reset link shortly.
          </div>
        {/if}

        <form onsubmit={handlePasswordSubmit} class="space-y-5">
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
                disabled={loading || inactiveUser}
                autocomplete="current-password"
                class="block w-full rounded-md border border-gray-300 px-4 py-3 pr-12 text-sm shadow-sm placeholder-gray-400 transition-all focus:border-[#3B68E5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3B68E5]/20"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                onclick={() => (showPassword = !showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabindex={-1}
              >
                {#if showPassword}
                  <EyeOff class="h-4 w-4" />
                {:else}
                  <Eye class="h-4 w-4" />
                {/if}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading || inactiveUser || password.length === 0}
            class="btn-gradient-blue w-full rounded-lg px-4 py-3 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#3B68E5] focus:ring-offset-2 disabled:opacity-50"
          >
            {#if loading}
              <span class="flex items-center justify-center gap-2">
                <svg class="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
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

        <div class="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            onclick={handleForgotPassword}
            disabled={loading}
            class="text-[#3B68E5] hover:text-[#2E50B3] disabled:opacity-50"
          >
            Forgot password?
          </button>
          {#if canFallbackToOtp}
            <button
              type="button"
              onclick={handleUseCodeInstead}
              disabled={loading}
              class="text-[#3B68E5] hover:text-[#2E50B3] disabled:opacity-50"
            >
              Use code instead
            </button>
          {/if}
        </div>
      {:else}
        <Button
          type="button"
          variant="ghost"
          onclick={backToEmail}
          disabled={loading}
          class="-ml-2 mb-3 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft class="h-4 w-4" />
          Back
        </Button>
        <h3 class="mb-1 text-lg font-semibold text-[#1a1a1a]">Check your email</h3>
        <p class="mb-5 text-sm text-gray-500">
          We sent a code to <span class="font-medium text-gray-700">{email}</span>.
        </p>

        {#if error}
          <div class="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-600 ring-1 ring-red-100">
            {error}
          </div>
        {/if}

        <form onsubmit={handleVerifySubmit} class="space-y-5">
          <div>
            <Label for="login-otp" class="mb-1 block text-sm font-medium text-gray-700">
              Verification code
            </Label>
            <input
              id="login-otp"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              pattern="\d{6}"
              maxlength={6}
              value={otp}
              oninput={handleOtpInput}
              disabled={loading || inactiveUser}
              placeholder="••••••"
              class="block w-full rounded-md border border-gray-300 px-4 py-3 text-center text-2xl font-semibold tabular-nums shadow-sm transition-all focus:border-[#3B68E5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3B68E5]/20 disabled:bg-gray-50"
              style="letter-spacing: 0.5em;"
              aria-label="6-digit verification code"
            />
          </div>

          <Button
            type="submit"
            disabled={verifyDisabled}
            class="btn-gradient-blue w-full rounded-lg px-4 py-3 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#3B68E5] focus:ring-offset-2 disabled:opacity-50"
          >
            {#if loading}
              <span class="flex items-center justify-center gap-2">
                <svg class="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Verifying…
              </span>
            {:else}
              Verify
            {/if}
          </Button>
        </form>

        <div class="mt-4 text-center text-sm">
          {#if canResend}
            <button
              type="button"
              onclick={handleResend}
              class="text-[#3B68E5] hover:text-[#2E50B3]"
            >
              Resend code
            </button>
          {:else if resendSecondsLeft > 0}
            <span class="text-gray-400">Resend code in {resendSecondsLeft}s</span>
          {:else}
            <span class="text-gray-400">Resend code</span>
          {/if}
        </div>
      {/if}
    </div>
  </main>
</div>
