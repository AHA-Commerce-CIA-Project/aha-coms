<script lang="ts">
  import { userState } from '$lib/state/userState.svelte'
  import { uiState } from '$lib/state/uiState.svelte'
  import { Toaster } from 'svelte-sonner'
  import '../app.css'

  let { data, children } = $props()

  $effect(() => {
    userState.init(data.user)
  })

  $effect(() => {
    uiState.initEffects()
  })
</script>

<Toaster richColors position="top-right" />
{@render children()}
