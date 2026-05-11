<script lang="ts">
  import { api } from '$lib/api/client'
  import { Search, User } from 'lucide-svelte'

  interface Employee {
    id: string
    name: string
    email: string
    role: string
    avatarUrl?: string | null
  }

  type EmployeeListPayload = {
    data?: Employee[]
  }

  interface Props {
    value?: string
    onChange: (id: string) => void
    excludeId?: string
    class?: string
  }

  let { value, onChange, excludeId, class: className = '' }: Props = $props()

  let search = $state('')
  let users = $state<Employee[]>([])
  let isOpen = $state(false)
  let loading = $state(false)
  let containerEl = $state<HTMLDivElement | null>(null)
  let debounceTimer = $state<ReturnType<typeof setTimeout> | null>(null)

  const selected = $derived(users.find((u) => u.id === value) ?? null)
  const filtered = $derived(excludeId ? users.filter((u) => u.id !== excludeId) : users)

  async function fetchUsers(query: string) {
    loading = true
    try {
      const result = await api.api.v1.users.get({
        query: { search: query, limit: 20, page: 1, isActive: true },
      })
      if (result.error) { users = []; return }
      users = ((result.data as EmployeeListPayload | null)?.data ?? []) as Employee[]
    } catch {
      users = []
    } finally {
      loading = false
    }
  }

  function handleInput(e: Event) {
    search = (e.target as HTMLInputElement).value
    isOpen = true
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => fetchUsers(search), 300)
  }

  function handleFocus() {
    isOpen = true
    if (users.length === 0 && !loading) fetchUsers(search)
  }

  function selectUser(emp: Employee) {
    onChange(emp.id)
    isOpen = false
    search = ''
  }

  function handleClickOutside(e: MouseEvent) {
    if (containerEl && !containerEl.contains(e.target as Node)) isOpen = false
  }

  $effect(() => {
    document.addEventListener('mousedown', handleClickOutside)
    fetchUsers('')
    return () => document.removeEventListener('mousedown', handleClickOutside)
  })
</script>

<div bind:this={containerEl} class="relative {className}">
  {#if selected && !isOpen}
    <button
      type="button"
      class="flex items-center gap-3 w-full rounded-lg border border-border bg-card p-3 text-left hover:bg-muted/50 transition-colors"
      onclick={() => { isOpen = true; search = '' }}
    >
      <div class="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10">
        <User class="h-4 w-4 text-primary" />
      </div>
      <div>
        <p class="text-sm font-medium">{selected.name}</p>
        <p class="text-xs text-muted-foreground">{selected.email}</p>
      </div>
    </button>
  {:else}
    <div class="relative">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        placeholder="Search employee by name..."
        value={search}
        oninput={handleInput}
        onfocus={handleFocus}
        autocomplete="off"
        class="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  {/if}

  {#if isOpen}
    <div class="absolute z-50 mt-1 w-full rounded-lg border border-border bg-card shadow-lg max-h-60 overflow-y-auto">
      {#if loading}
        <p class="p-3 text-sm text-muted-foreground text-center">Loading...</p>
      {:else if filtered.length === 0}
        <p class="p-3 text-sm text-muted-foreground text-center">No employees found</p>
      {:else}
        {#each filtered as emp (emp.id)}
          <button
            type="button"
            class="flex items-center gap-3 w-full p-3 text-left hover:bg-muted/50 transition-colors {emp.id === value ? 'bg-primary/5' : ''}"
            onclick={() => selectUser(emp)}
          >
            <div class="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 shrink-0">
              <User class="h-4 w-4 text-primary" />
            </div>
            <div class="min-w-0">
              <p class="text-sm font-medium truncate">{emp.name}</p>
              <p class="text-xs text-muted-foreground truncate">{emp.email}</p>
            </div>
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>
