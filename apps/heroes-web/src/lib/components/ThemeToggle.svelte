<script lang="ts">
  import { Sun, Moon, Monitor } from 'lucide-svelte'
  import { uiState } from '$lib/state/uiState.svelte'

  const CYCLE: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system']

  function cycleTheme() {
    const idx = CYCLE.indexOf(uiState.theme)
    const next = CYCLE[(idx + 1) % CYCLE.length]
    uiState.setTheme(next)
  }

  const label = $derived(
    uiState.theme === 'light'
      ? 'Switch to dark mode'
      : uiState.theme === 'dark'
        ? 'Switch to system mode'
        : 'Switch to light mode',
  )
</script>

<button
  type="button"
  onclick={cycleTheme}
  class="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/8 hover:text-foreground transition-colors"
  aria-label={label}
>
  {#if uiState.theme === 'light'}
    <Sun class="h-4 w-4" />
  {:else if uiState.theme === 'dark'}
    <Moon class="h-4 w-4" />
  {:else}
    <Monitor class="h-4 w-4" />
  {/if}
</button>
