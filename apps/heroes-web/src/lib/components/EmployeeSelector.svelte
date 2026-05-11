<script lang="ts">
  import { api } from '$lib/api/client'
  import { Input, Label } from '@coms-portal/ui/primitives'
  import * as m from '$lib/paraglide/messages'

  interface User {
    id: string
    name: string
    email: string
    role: string
    teamName?: string | null
    isActive: boolean
  }

  type UserListPayload = {
    data?: User[]
  }

  interface Props {
    value: string
    disabled?: boolean
  }

  let { value = $bindable(''), disabled = false }: Props = $props()

  let search = $state('')
  let users = $state<User[]>([])
  let open = $state(false)
  let loading = $state(false)
  let fallback = $state(false)
  let selectedName = $state('')
  let debounceTimer = $state<ReturnType<typeof setTimeout> | null>(null)

  // Track the input element and dropdown for click-outside handling
  let containerRef = $state<HTMLDivElement | null>(null)

  async function fetchUsers(query: string) {
    loading = true
    try {
      const result = await api.api.v1.users.get({
        query: { search: query, limit: 20, page: 1, isActive: true },
      })

      if (result.error) {
        // User may not have admin/hr role -- fall back to manual ID input
        fallback = true
        users = []
        return
      }

      users = ((result.data as unknown as UserListPayload | null)?.data ?? []) as User[]
    } catch {
      users = []
    } finally {
      loading = false
    }
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement
    search = target.value
    open = true

    // Clear any previously selected value when user edits the search
    if (selectedName && search !== selectedName) {
      value = ''
      selectedName = ''
    }

    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      fetchUsers(search)
    }, 300)
  }

  function selectUser(user: User) {
    value = user.id
    selectedName = user.name
    search = `${user.name} (${user.email})`
    open = false
  }

  function handleFocus() {
    if (!fallback) {
      open = true
      if (users.length === 0 && !loading) {
        fetchUsers(search)
      }
    }
  }

  function handleClickOutside(e: MouseEvent) {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      open = false
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      open = false
    }
  }

  $effect(() => {
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeydown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeydown)
    }
  })

  // Initial fetch on mount to check access
  $effect(() => {
    fetchUsers('')
  })
</script>

<div class="space-y-1.5">
  <Label for="userId">{m.form_staff_name()}</Label>

  {#if fallback}
    <!-- Fallback: manual UUID input for non-admin/hr users -->
    <Input
      id="userId"
      type="text"
      placeholder={m.form_staff_name()}
      bind:value={value}
      required
      {disabled}
    />
    <p class="text-xs text-muted-foreground">
      {m.form_error_select_employee()}
    </p>
  {:else}
    <!-- Searchable employee selector for admin/hr users -->
    <div bind:this={containerRef} class="relative">
      <Input
        id="userId"
        type="text"
        placeholder={m.users_search_placeholder()}
        value={search}
        oninput={handleInput}
        onfocus={handleFocus}
        autocomplete="off"
        required={!value}
        {disabled}
      />

      {#if value}
        <input type="hidden" name="userId" value={value} />
      {/if}

      {#if open && !disabled}
        <div
          class="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-md"
        >
          {#if loading}
            <div class="px-3 py-2 text-sm text-muted-foreground">
              {m.common_loading()}
            </div>
          {:else if users.length === 0}
            <div class="px-3 py-2 text-sm text-muted-foreground">
              {search ? m.users_empty() : m.users_search_placeholder()}
            </div>
          {:else}
            {#each users as user (user.id)}
              <button
                type="button"
                class="flex w-full flex-col items-start rounded-md px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground {user.id === value ? 'bg-accent' : ''}"
                onclick={() => selectUser(user)}
              >
                <span class="font-medium">{user.name}</span>
                <span class="text-xs text-muted-foreground">
                  {user.email}
                  {#if user.teamName}
                    &middot; {user.teamName}
                  {/if}
                </span>
              </button>
            {/each}
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
