<script lang="ts">
  import { invalidateAll } from '$app/navigation'
  import { Card, CardHeader, CardTitle, CardContent, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge } from '@coms-portal/ui-svelte/primitives'
  import IdentityCreateForm from '$lib/components/admin/identity-create-form.svelte'

  let { data } = $props()

  async function refresh() {
    await invalidateAll()
  }
</script>

<div class="space-y-6 p-8">
  <header>
    <h1 class="text-xl font-semibold">Password Identities</h1>
    <p class="mt-1 text-xs text-muted-foreground">
      Admin-created credential bags. Use this surface for test accounts, shared admin logins, or sub-admin
      identities without a workspace email. These identities sign in with email + password only — OTP and
      the public forgot-password flow are intentionally disabled.
    </p>
  </header>

  <div class="grid gap-6 lg:grid-cols-2">
    <Card class="lg:row-start-1">
      <CardHeader>
        <CardTitle>Create identity</CardTitle>
      </CardHeader>
      <CardContent>
        <IdentityCreateForm onCreated={refresh} />
      </CardContent>
    </Card>

    <Card class="lg:col-start-2 lg:row-start-1">
      <CardHeader>
        <CardTitle>Existing identities ({data.identities.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {#if data.error}
          <p class="text-xs text-rose-500">Failed to load identities: {data.error}</p>
        {:else if data.identities.length === 0}
          <p class="text-xs text-muted-foreground">No password identities yet. Create one with the form on the left.</p>
        {:else}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {#each data.identities as identity (identity.id)}
                <TableRow>
                  <TableCell class="font-medium">{identity.name}</TableCell>
                  <TableCell>{identity.email ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={identity.status === 'active' ? 'default' : 'secondary'}>{identity.status}</Badge>
                  </TableCell>
                  <TableCell class="text-xs text-muted-foreground">
                    {new Date(identity.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell class="text-xs text-muted-foreground">{identity.notes ?? ''}</TableCell>
                </TableRow>
              {/each}
            </TableBody>
          </Table>
        {/if}
      </CardContent>
    </Card>
  </div>
</div>
