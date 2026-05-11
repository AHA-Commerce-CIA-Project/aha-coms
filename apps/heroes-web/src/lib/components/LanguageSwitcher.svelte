<script lang="ts">
  import { getLocale, setLocale } from '$lib/paraglide/runtime'
  import { invalidateAll } from '$app/navigation'

  const LANGUAGES = ['id', 'en', 'th'] as const
  const current = $derived(getLocale())

  async function handleSet(lang: string) {
    if (current === lang) return
    setLocale(lang as 'id' | 'en' | 'th', { reload: false })
    await invalidateAll()
  }
</script>

<div class="border-border bg-muted flex items-center overflow-hidden rounded-lg border">
  {#each LANGUAGES as lang (lang)}
    {@const isActive = current === lang}
    <button
      type="button"
      class="px-2.5 py-1.5 text-[11px] font-bold tracking-wide transition-all {isActive
        ? 'bg-primary text-white shadow-sm'
        : 'text-muted-foreground hover:text-primary'}"
      onclick={() => handleSet(lang)}
    >
      {lang.toUpperCase()}
    </button>
  {/each}
</div>
