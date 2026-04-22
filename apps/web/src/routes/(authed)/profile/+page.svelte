  <script lang="ts">
    import { getContext } from 'svelte'
    import type { SessionUser } from '$lib/auth'
    import { PORTAL_ROLE_LABELS } from '@coms-portal/shared'

  const getUser = getContext<() => SessionUser | null>('user')
  const user = $derived(getUser())
</script>

<div class="p-8">
  <div class="mb-6">
    <h1 class="text-xl font-semibold">Profile</h1>
    <p class="mt-1 text-sm text-muted-foreground">Your account information</p>
  </div>

  {#if user}
    <div class="max-w-lg space-y-3 rounded-xl border border-border bg-card p-6">
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
        <span class="text-xs text-muted-foreground">Email</span>
        <span class="text-sm">{user.email}</span>
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
      <div class="mt-4 max-w-lg">
        <p class="mb-2 text-xs text-muted-foreground">Accessible Apps</p>
        <div class="flex flex-wrap gap-2">
          {#each user.apps as appSlug}
            <span class="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">{appSlug}</span>
          {/each}
        </div>
      </div>
    {/if}
  {:else}
    <p class="text-sm text-muted-foreground">Could not load profile.</p>
  {/if}
</div>
