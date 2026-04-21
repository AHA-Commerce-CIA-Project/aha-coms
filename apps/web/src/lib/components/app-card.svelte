<script lang="ts">
  let { app, redirectTo }: {
    app: { id: string; slug: string; name: string; description: string | null; url: string; iconUrl: string | null; status: string }
    redirectTo?: string
  } = $props()

  const launchHref = $derived(
    redirectTo
      ? `/api/auth/broker/launch/${app.slug}?redirectTo=${encodeURIComponent(redirectTo)}`
      : `/api/auth/broker/launch/${app.slug}`
  )

  const initial = $derived(app.name.charAt(0).toUpperCase())
</script>

<a
  href={launchHref}
  class="group flex flex-col gap-3 rounded-xl card-surface card-hover p-4 transition-all tap-active"
>
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
  </div>
</a>
