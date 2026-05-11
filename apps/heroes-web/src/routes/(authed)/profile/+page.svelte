<script lang="ts">
  import { Button } from '@coms-portal/ui/primitives'
  import { userState } from '$lib/state/userState.svelte'
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte'
  import * as m from '$lib/paraglide/messages'
  import { signOut } from '$lib/auth/client'
  import {
    User,
    Star,
    Award,
    AlertTriangle,
    KeyRound,
    Globe,
    LogOut,
    Camera,
    Building2,
    Users,
    ChevronRight,
  } from 'lucide-svelte'

  const user = $derived(userState.current)

  let loggingOut = $state(false)

  const ROLE_GRADIENTS: Record<string, string> = {
    admin: 'bg-gradient-role-admin',
    hr: 'bg-gradient-role-hr',
    leader: 'bg-gradient-role-leader',
    employee: 'bg-gradient-role-employee',
  }

  const initials = $derived(
    user
      ? user.name
          .split(' ')
          .map((n: string) => n[0])
          .slice(0, 2)
          .join('')
          .toUpperCase()
      : '',
  )

  const roleGradient = $derived(
    ROLE_GRADIENTS[user?.role ?? 'employee'] ?? ROLE_GRADIENTS.employee,
  )

  async function handleLogout() {
    loggingOut = true
    try {
      await signOut()
    } catch {
      // ignore
    } finally {
      userState.clear()
    }
  }
</script>

{#if user}
  <div class="mx-auto max-w-lg space-y-4 p-4 pb-24 pt-5 md:pb-8">
    <!-- Profile hero card -->
    <div class="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <!-- Gradient banner -->
      <div class="relative h-24 {roleGradient}">
        <div
          class="pointer-events-none absolute -right-6 -top-4 h-24 w-24 rounded-full bg-white/10 blur-xl"
        ></div>
        <div
          class="pointer-events-none absolute bottom-0 left-8 h-16 w-16 rounded-full bg-white/10 blur-lg"
        ></div>
      </div>

      <div class="px-5 pb-5">
        <!-- Avatar overlapping the banner -->
        <div class="relative -mt-10 mb-3 flex items-end justify-between">
          <div class="relative">
            <div
              class="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-card text-2xl font-bold text-primary ring-4 ring-card shadow-lg"
            >
              {#if initials}
                {initials}
              {:else}
                <User class="h-8 w-8" />
              {/if}
            </div>
            <button
              type="button"
              class="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-colors hover:bg-primary/80"
              aria-label={m.profile_edit_avatar()}
            >
              <Camera class="h-3.5 w-3.5" />
            </button>
          </div>
          <span
            class="rounded-xl {roleGradient} px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-white shadow-sm"
          >
            {user.role}
          </span>
        </div>

        <!-- Name + email -->
        <h1 class="text-lg font-extrabold leading-tight text-foreground">{user.name}</h1>
        <p class="mt-0.5 text-sm text-muted-foreground">{user.email}</p>

        <!-- Info grid -->
        <div class="mt-4 grid grid-cols-2 gap-2">
          <div class="flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
            <Building2 class="h-3.5 w-3.5 shrink-0 text-primary/60" />
            <div class="min-w-0">
              <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {m.profile_branch()}
              </p>
              <p class="truncate text-xs font-bold text-foreground">{user.branchValueSnapshot ?? user.branchKey}</p>
            </div>
          </div>
          {#if user.teamKey}
            <div class="flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
              <Users class="h-3.5 w-3.5 shrink-0 text-primary/60" />
              <div class="min-w-0">
                <p
                  class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70"
                >
                  {m.profile_team()}
                </p>
                <p class="truncate text-xs font-bold text-foreground">{user.teamValueSnapshot ?? user.teamKey}</p>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Stats row (placeholders — Phase 7 will provide real values) -->
    <div class="grid grid-cols-3 gap-3">
      <div
        class="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-3.5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]"
      >
        <div
          class="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/10 text-gold-dark"
        >
          <Star class="h-5 w-5" />
        </div>
        <span class="text-xl font-extrabold leading-none text-gold-dark">—</span>
        <span class="text-center text-[10px] font-semibold leading-tight text-muted-foreground/70"
          >{m.points_bintang()}</span
        >
      </div>
      <div
        class="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-3.5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]"
      >
        <div
          class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <Award class="h-5 w-5" />
        </div>
        <span class="text-xl font-extrabold leading-none text-primary">—</span>
        <span class="text-center text-[10px] font-semibold leading-tight text-muted-foreground/70"
          >{m.points_poin_aha()}</span
        >
      </div>
      <div
        class="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-3.5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]"
      >
        <div
          class="flex h-10 w-10 items-center justify-center rounded-xl bg-penalti/10 text-penalti"
        >
          <AlertTriangle class="h-5 w-5" />
        </div>
        <span class="text-xl font-extrabold leading-none text-penalti">—</span>
        <span class="text-center text-[10px] font-semibold leading-tight text-muted-foreground/70"
          >{m.points_penalti()}</span
        >
      </div>
      <!-- TODO: replace stat placeholders when Phase 7 profile stats are wired -->
    </div>

    <!-- Action list -->
    <div class="space-y-2.5">
      <a
        href="/change-password"
        class="flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-sm font-semibold text-foreground shadow-card transition-colors hover:bg-primary/4"
      >
        <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
          <KeyRound class="h-4 w-4 text-primary" />
        </div>
        <span class="flex-1">{m.change_password_title()}</span>
        <ChevronRight class="h-4 w-4 text-muted-foreground/40" />
      </a>

      <div
        class="flex min-h-[52px] items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-card"
      >
        <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
          <Globe class="h-4 w-4 text-primary" />
        </div>
        <span class="flex-1 text-sm font-semibold text-foreground">{m.profile_language()}</span>
        <LanguageSwitcher />
      </div>

      <Button
        variant="outline"
        class="min-h-[52px] w-full justify-start gap-3 rounded-2xl border-destructive/30 bg-card py-3.5 text-destructive shadow-card hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive dark:border-destructive/40 dark:hover:border-destructive/60 dark:hover:bg-destructive/20"
        disabled={loggingOut}
        onclick={handleLogout}
      >
        <div
          class="flex h-8 w-8 items-center justify-center rounded-xl bg-destructive/10 dark:bg-destructive/20"
        >
          <LogOut class="h-4 w-4" />
        </div>
        <span class="font-semibold"
          >{loggingOut ? m.profile_logging_out() : m.profile_logout()}</span
        >
      </Button>
    </div>
  </div>
{:else}
  <div class="mx-auto max-w-lg animate-pulse space-y-5 p-4 pt-6">
    <div class="h-48 rounded-2xl bg-primary/10"></div>
    <div class="grid grid-cols-3 gap-3">
      {#each [0, 1, 2] as _i (_i)}
        <div class="h-24 rounded-2xl border border-border bg-card"></div>
      {/each}
    </div>
    <div class="space-y-2">
      {#each [0, 1, 2] as _i (_i)}
        <div class="h-14 rounded-2xl border border-border bg-card"></div>
      {/each}
    </div>
  </div>
{/if}
