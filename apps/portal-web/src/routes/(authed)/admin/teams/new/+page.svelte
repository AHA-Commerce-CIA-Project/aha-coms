<script lang="ts">
  import { goto } from '$app/navigation'
  import { createTeamMutation } from '$lib/queries/teams'
  import { Card, CardHeader, CardTitle, CardContent, Button, Label, Input, Textarea } from '@coms-portal/ui-svelte/primitives'

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

  <Card class="max-w-lg">
    <CardHeader>
      <CardTitle>Team Details</CardTitle>
    </CardHeader>
    <CardContent>
      <form onsubmit={handleSubmit} class="space-y-4">
        <div>
          <Label for="team-name" class="mb-1 block text-xs text-muted-foreground">
            Name <span class="text-destructive">*</span>
          </Label>
          <Input
            id="team-name"
            type="text"
            bind:value={form.name}
            required
            class="w-full"
          />
        </div>
        <div>
          <Label for="team-description" class="mb-1 block text-xs text-muted-foreground">Description</Label>
          <Textarea
            id="team-description"
            bind:value={form.description}
            rows={3}
            class="w-full"
          />
        </div>

        {#if error}
          <p class="text-xs text-destructive">{error}</p>
        {/if}

        <div class="flex gap-3">
          <Button
            type="submit"
            disabled={$mutation.isPending}
          >
            Create
          </Button>
          <Button href="/admin/teams" variant="outline">Cancel</Button>
        </div>
      </form>
    </CardContent>
  </Card>
</div>
