<script lang="ts">
  import { goto } from '$app/navigation'
  import { createTeamMutation } from '$lib/queries/teams'

  const mutation = createTeamMutation()

  let form = $state({ name: '', description: '' })
  let error = $state<string | null>(null)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    error = null
    try {
      await $mutation.mutateAsync({
        name: form.name,
        description: form.description || undefined,
      })
      await goto('/admin/teams')
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create team'
    }
  }
</script>

<div class="p-8">
  <h1 class="mb-6 text-xl font-semibold">New Team</h1>

  <form onsubmit={handleSubmit} class="max-w-lg space-y-4">
    <div>
      <label for="team-name" class="mb-1 block text-xs text-neutral-400">Name <span class="text-red-400">*</span></label>
      <input
        id="team-name"
        type="text"
        bind:value={form.name}
        required
        class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      />
    </div>
    <div>
      <label for="team-description" class="mb-1 block text-xs text-neutral-400">Description</label>
      <textarea
        id="team-description"
        bind:value={form.description}
        rows="3"
        class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      ></textarea>
    </div>

    {#if error}
      <p class="text-xs text-red-400">{error}</p>
    {/if}

    <div class="flex gap-3">
      <button
        type="submit"
        disabled={$mutation.isPending}
        class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
      >
        Create
      </button>
      <a href="/admin/teams" class="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800">Cancel</a>
    </div>
  </form>
</div>
