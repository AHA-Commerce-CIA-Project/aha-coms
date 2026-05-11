<script lang="ts">
  import { page } from '$app/stores'
  import * as m from '$lib/paraglide/messages'
</script>

<div class="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
  <h1 class="text-xl font-extrabold text-foreground">{$page.status}</h1>
  <p class="text-muted-foreground">{$page.error?.message ?? m.common_something_wrong()}</p>
  <a href="/" class="text-primary underline">Go home</a>
</div>
