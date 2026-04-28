<script lang="ts">
  import type { Snippet } from 'svelte'
  import { signOut as performSignOut } from './sign-out'

  /**
   * AccountWidget — shared COMS account surface mounted in the chrome's
   * right slot by every COMS app (portal, Heroes, future H-apps).
   *
   * Presentational only (spec-01 §line 42): the host loads `user` server-side
   * and passes it down. The widget never calls portal endpoints itself; the
   * single non-presentational action is sign-out, which is a top-level
   * browser navigation handled by `./sign-out.ts`.
   */
  interface AppSwitcherEntry {
    slug: string
    label: string
    url: string
  }

  let {
    currentApp,
    portalOrigin,
    user,
    appSwitcher,
    postLogoutRedirectUri,
    notificationsSlot,
  }: {
    /** Slug of the host app. Must match an entry in `user.apps`. */
    currentApp: string
    /** Portal origin (e.g., "https://coms.ahacommerce.net"). Used for /profile + sign-out URLs. */
    portalOrigin: string
    /** Authenticated user. Host loads server-side; widget treats null as a programming error. */
    user: {
      name: string
      email: string
      portalRole: string
      apps: string[]
    }
    /** Apps for the launcher list. Host derives from user.apps + slug→URL map. */
    appSwitcher: AppSwitcherEntry[]
    /** Where portal redirects after sign-out. Defaults to host origin's "/" if omitted. */
    postLogoutRedirectUri?: string
    /** Reserved for spec-01 §Visual Spec future notifications-bell slot. */
    notificationsSlot?: Snippet
  } = $props()

  // Dev-only sanity check per spec-01 §Risk + Mitigations: if the host's
  // currentApp isn't in user.apps, the launcher highlight will silently miss.
  // The check fires on localhost only — a missing highlight is not user-facing
  // breakage in production, so production stays silent.
  $effect(() => {
    if (typeof window === 'undefined') return
    const host = window.location?.hostname ?? ''
    const isLocalDev = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')
    if (isLocalDev && currentApp && user?.apps && !user.apps.includes(currentApp)) {
      console.warn(
        `[@coms-portal/account-widget] currentApp="${currentApp}" not in user.apps`,
        user.apps,
      )
    }
  })

  let popoverOpen = $state(false)

  const initials = $derived(
    user
      ? user.name
          .split(' ')
          .map((n) => n[0])
          .slice(0, 2)
          .join('')
          .toUpperCase()
      : '',
  )

  const trimmedPortalOrigin = $derived(
    portalOrigin.endsWith('/') ? portalOrigin.slice(0, -1) : portalOrigin,
  )

  const profileHref = $derived(`${trimmedPortalOrigin}/profile`)

  function handleSignOut() {
    popoverOpen = false
    performSignOut({
      portalOrigin: trimmedPortalOrigin,
      postLogoutRedirectUri: postLogoutRedirectUri ?? `${window.location.origin}/`,
    })
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') popoverOpen = false
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if user}
  <button
    type="button"
    onclick={() => (popoverOpen = !popoverOpen)}
    class="relative flex h-[26px] items-center gap-1.5 rounded-md px-2 hover:bg-white/6 transition-colors"
    aria-label="Account menu"
    aria-haspopup="menu"
    aria-expanded={popoverOpen}
  >
    <div class="flex h-5 w-5 items-center justify-center rounded-full bg-primary-light/25 text-[8px] font-bold text-primary-light">
      {initials}
    </div>
    <span class="hidden text-[11px] font-semibold text-primary-light/70 sm:inline">
      {user.name.split(' ')[0]}
    </span>
  </button>

  {#if popoverOpen}
    <button
      type="button"
      class="fixed inset-0 z-[75]"
      onclick={() => (popoverOpen = false)}
      aria-label="Close menu"
      tabindex="-1"
    ></button>

    <div
      class="fixed top-9 right-3 z-[80] w-64 rounded-xl border border-border bg-card shadow-modal overflow-hidden"
      role="menu"
    >
      <div class="px-4 py-3 border-b border-border">
        <p class="text-sm font-semibold text-foreground truncate">{user.name}</p>
        <p class="text-xs text-muted-foreground truncate">{user.email}</p>
        <span class="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {user.portalRole}
        </span>
      </div>

      <div class="p-1 border-b border-border">
        <a
          href={profileHref}
          onclick={() => (popoverOpen = false)}
          class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          role="menuitem"
        >
          Manage account
        </a>
      </div>

      {#if appSwitcher.length > 0}
        <div class="p-1 border-b border-border">
          <div class="px-3 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
            Apps
          </div>
          {#each appSwitcher as app (app.slug)}
            {@const isActive = app.slug === currentApp}
            <a
              href={app.url}
              onclick={() => (popoverOpen = false)}
              class="flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors
                {isActive
                  ? 'bg-accent text-foreground border-l-2 border-primary font-semibold'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
              role="menuitem"
              aria-current={isActive ? 'page' : undefined}
            >
              <span>{app.label}</span>
              {#if isActive}
                <span class="text-[10px] font-semibold uppercase tracking-wide text-primary">Here</span>
              {/if}
            </a>
          {/each}
        </div>
      {/if}

      {#if notificationsSlot}
        <div class="p-1 border-b border-border">
          {@render notificationsSlot()}
        </div>
      {/if}

      <div class="p-1">
        <button
          type="button"
          onclick={handleSignOut}
          class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          role="menuitem"
        >
          Sign out
        </button>
      </div>
    </div>
  {/if}
{/if}
