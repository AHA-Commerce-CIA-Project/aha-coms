<script lang="ts">
  let { app, redirectTo }: {
    app: { id: string; slug: string; name: string; description: string | null; url: string; iconUrl: string | null; status: string; healthStatus?: string }
    redirectTo?: string
  } = $props()

  const launchAction = $derived(`/api/auth/broker/launch/${app.slug}`)
  const initial = $derived(app.name.charAt(0).toUpperCase())
</script>

<form method="GET" action={launchAction}>
  {#if redirectTo}
    <input type="hidden" name="redirectTo" value={redirectTo} />
  {/if}
  <button type="submit" class="group flex w-full flex-col gap-3 rounded-xl card-surface card-hover p-4 transition-all tap-active text-left">
    <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/15 transition-colors">
      {#if app.iconUrl}
        <img src={app.iconUrl} alt={app.name} class="h-6 w-6 object-contain" />
      {:else}
        <span class="text-lg font-bold text-primary">{initial}</span>
      {/if}
    </div>
    <div>
      <p class="text-sm font-semibold text-foreground">{app.name}</p>
      {#if app.description}
        <p class="mt-0.5 text-xs text-muted-foreground line-clamp-2">{app.description}</p>
      {/if}
      {#if app.healthStatus === 'unhealthy'}
        <div class="mt-2 flex items-center gap-1 text-xs text-red-500">
          <span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>
          Unavailable
        </div>
      {:else if app.healthStatus === 'degraded'}
        <div class="mt-2 flex items-center gap-1 text-xs text-yellow-500">
          <span class="h-1.5 w-1.5 rounded-full bg-yellow-500"></span>
          Degraded
        </div>
      {:else if app.healthStatus === 'unknown'}
        <div class="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <span class="h-1.5 w-1.5 rounded-full bg-muted-foreground"></span>
          Status unknown
        </div>
      {/if}
    </div>
  </button>
</form>
