<script lang="ts">
  import { goto } from '$app/navigation'
  import { createEmployeeMutation } from '$lib/queries/employees'
  import { teamsQuery } from '$lib/queries/teams'
  import { PORTAL_ROLES, PORTAL_ROLE_LABELS, type PortalRole } from '@coms-portal/shared'
  import { Card, CardHeader, CardTitle, CardContent, Button, Label, Input, Select, SelectTrigger, SelectContent, SelectItem } from '@coms-portal/ui-svelte/primitives'

  const mutation = createEmployeeMutation()
  const teams = teamsQuery()

  let form = $state({
    workspaceEmail: '',
    personalEmail: '',
    name: '',
    phone: '',
    position: '',
    branch: '' as '' | 'Indonesia' | 'Thailand',
    portalRole: 'employee' as PortalRole,
    teamId: '',

    birthDate: '',
    leaderName: '',
  })

  let error = $state<string | null>(null)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    error = null
    if (!form.workspaceEmail.trim() && !form.personalEmail.trim()) {
      error = 'At least one of Workspace Email or Personal Email is required.'
      return
    }
    try {
      const result = await $mutation.mutateAsync({
        workspaceEmail: form.workspaceEmail.trim() || undefined,
        personalEmail: form.personalEmail.trim() || undefined,
        name: form.name,
        phone: form.phone || undefined,
        position: form.position || undefined,
        branch: form.branch || undefined,
        portalRole: form.portalRole,
        teamId: form.teamId || undefined,

        birthDate: form.birthDate || undefined,
        leaderName: form.leaderName || undefined,
      })
      if (result.provisioningStatus === 'failed') {
        await goto(`/admin/employees/${result.id}?provisioning=failed`)
        return
      }

      await goto('/admin/employees')
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create employee'
    }
  }
</script>

<div class="p-8">
  <h1 class="mb-6 text-xl font-semibold">New Employee</h1>

  <Card class="max-w-lg">
    <CardHeader>
      <CardTitle>Employee Details</CardTitle>
    </CardHeader>
    <CardContent>
      <form onsubmit={handleSubmit} class="space-y-4">
        <div>
          <Label for="employee-workspace-email" class="mb-1 block text-xs text-muted-foreground">Workspace Email</Label>
          <Input
            id="employee-workspace-email"
            type="email"
            placeholder="name@ahacommerce.net"
            bind:value={form.workspaceEmail}
            class="w-full"
          />
        </div>
        <div>
          <Label for="employee-personal-email" class="mb-1 block text-xs text-muted-foreground">Personal Email</Label>
          <Input
            id="employee-personal-email"
            type="email"
            placeholder="name@gmail.com"
            bind:value={form.personalEmail}
            class="w-full"
          />
          <p class="mt-1 text-[10px] text-muted-foreground">At least one of Workspace or Personal email is required.</p>
        </div>
        <div>
          <Label for="employee-name" class="mb-1 block text-xs text-muted-foreground">Name</Label>
          <Input id="employee-name" type="text" bind:value={form.name} required class="w-full" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <Label for="employee-phone" class="mb-1 block text-xs text-muted-foreground">Phone</Label>
            <Input id="employee-phone" type="text" bind:value={form.phone} class="w-full" />
          </div>
          <div>
            <Label for="employee-position" class="mb-1 block text-xs text-muted-foreground">Position</Label>
            <Input id="employee-position" type="text" bind:value={form.position} class="w-full" />
          </div>
        </div>
        <div>
          <Label for="employee-birth-date" class="mb-1 block text-xs text-muted-foreground">Birth Date</Label>
          <Input id="employee-birth-date" type="date" bind:value={form.birthDate} class="w-full" />
        </div>
        <div>
          <Label for="employee-leader" class="mb-1 block text-xs text-muted-foreground">Leader</Label>
          <Input id="employee-leader" type="text" bind:value={form.leaderName} class="w-full" />
        </div>
        <div>
          <Label class="mb-1 block text-xs text-muted-foreground">Branch</Label>
          <Select
            type="single"
            value={form.branch || undefined}
            onValueChange={(v) => { form.branch = (v ?? '') as '' | 'Indonesia' | 'Thailand' }}
            required
          >
            <SelectTrigger class="w-full">
              <span>{form.branch || 'Select branch'}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Indonesia" label="Indonesia" />
              <SelectItem value="Thailand" label="Thailand" />
            </SelectContent>
          </Select>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <Label class="mb-1 block text-xs text-muted-foreground">Portal Role</Label>
            <Select
              type="single"
              value={form.portalRole}
              onValueChange={(v) => { if (v) form.portalRole = v as PortalRole }}
            >
              <SelectTrigger class="w-full">
                <span>{PORTAL_ROLE_LABELS[form.portalRole]}</span>
              </SelectTrigger>
              <SelectContent>
                {#each PORTAL_ROLES as role}
                  <SelectItem value={role} label={PORTAL_ROLE_LABELS[role]} />
                {/each}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label class="mb-1 block text-xs text-muted-foreground">Team</Label>
            <Select
              type="single"
              value={form.teamId || undefined}
              onValueChange={(v) => { form.teamId = v ?? '' }}
            >
              <SelectTrigger class="w-full">
                <span>{$teams.data?.find((t) => t.id === form.teamId)?.name ?? 'No team'}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="" label="No team" />
                {#if $teams.data}
                  {#each $teams.data as team}
                    <SelectItem value={team.id} label={team.name} />
                  {/each}
                {/if}
              </SelectContent>
            </Select>
          </div>
        </div>
        {#if error}
          <p class="text-xs text-destructive">{error}</p>
        {/if}

        <div class="flex gap-3">
          <Button type="submit" disabled={$mutation.isPending}>Create</Button>
          <Button href="/admin/employees" variant="outline">Cancel</Button>
        </div>
      </form>
    </CardContent>
  </Card>
</div>
