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
      <label for="team-name" class="mb-1 block text-xs text-muted-foreground">Name <span class="text-destructive">*</span></label>
      <input
        id="team-name"
        type="text"
        bind:value={form.name}
        required
        class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none"
      />
    </div>
    <div>
      <label for="team-description" class="mb-1 block text-xs text-muted-foreground">Description</label>
      <textarea
        id="team-description"
        bind:value={form.description}
        rows="3"
        class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none"
      ></textarea>
    </div>

    {#if error}
      <p class="text-xs text-destructive">{error}</p>
    {/if}

    <div class="flex gap-3">
      <button
        type="submit"
        disabled={$mutation.isPending}
        class="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
      >
        Create
      </button>
      <a href="/admin/teams" class="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent">Cancel</a>
    </div>
  </form>
</div>
