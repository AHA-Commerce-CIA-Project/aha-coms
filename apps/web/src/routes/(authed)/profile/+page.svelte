<script lang="ts">
  import { getContext } from 'svelte'
  import type { SessionUser } from '$lib/auth'

  const getUser = getContext<() => SessionUser | null>('user')
  const user = $derived(getUser())

  const roleLabels: Record<string, string> = {
    employee: 'Employee',
    admin: 'Admin',
    super_admin: 'Super Admin',
  }
</script>

<div class="p-8">
  <div class="mb-6">
    <h1 class="text-xl font-semibold">Profile</h1>
    <p class="mt-1 text-sm text-neutral-400">Your account information</p>
  </div>

  {#if user}
    <div class="max-w-lg space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
      <div class="mb-4 flex items-center gap-4">
        <div class="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-700 text-lg font-semibold">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p class="font-medium">{user.name}</p>
          <p class="text-sm text-neutral-400">{user.email}</p>
        </div>
      </div>

      <div class="flex justify-between border-b border-neutral-800 pb-2">
        <span class="text-xs text-neutral-400">Name</span>
        <span class="text-sm">{user.name}</span>
      </div>
      <div class="flex justify-between border-b border-neutral-800 pb-2">
        <span class="text-xs text-neutral-400">Email</span>
        <span class="text-sm">{user.email}</span>
      </div>
      <div class="flex justify-between border-b border-neutral-800 pb-2">
        <span class="text-xs text-neutral-400">Role</span>
        <span class="rounded-full bg-neutral-800 px-2 py-0.5 text-xs">{roleLabels[user.portalRole] ?? user.portalRole}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-xs text-neutral-400">App Access</span>
        <span class="text-sm text-neutral-300">{user.apps.length} app{user.apps.length !== 1 ? 's' : ''}</span>
      </div>
    </div>

    {#if user.apps.length > 0}
      <div class="mt-4 max-w-lg">
        <p class="mb-2 text-xs text-neutral-500">Accessible Apps</p>
        <div class="flex flex-wrap gap-2">
          {#each user.apps as appSlug}
            <span class="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">{appSlug}</span>
          {/each}
        </div>
      </div>
    {/if}
  {:else}
    <p class="text-sm text-neutral-500">Could not load profile.</p>
  {/if}
</div>
