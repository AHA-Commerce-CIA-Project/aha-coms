<script lang="ts">
  import { Trophy } from 'lucide-svelte'
</script>

<svelte:head>
  <title>Signed out — AHA HEROES</title>
</svelte:head>

<main class="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background text-foreground">
  <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-gold to-gold-light shadow-md mb-6">
    <Trophy class="h-6 w-6 text-gold-dark" />
  </div>
  <h1 class="font-manrope text-2xl font-extrabold tracking-tight mb-2">You're signed out</h1>
  <p class="text-sm text-muted-foreground mb-8 text-center max-w-sm">
    Your AHA HEROES session has ended. To return, sign in through the COMS portal.
  </p>
  <a
    href="/"
    class="inline-flex h-11 items-center justify-center rounded-lg px-6 btn-gradient-blue text-white text-sm font-semibold"
  >
    Sign in again
  </a>
</main>
