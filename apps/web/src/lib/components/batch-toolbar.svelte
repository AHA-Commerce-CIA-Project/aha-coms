<script lang="ts">
  interface BatchAction {
    key: string
    label: string
    options: { value: string; label: string }[]
  }

  let {
    selectedCount,
    actions,
    onApply,
    isPending = false,
  }: {
    selectedCount: number
    actions: BatchAction[]
    onApply: (action: string, value: string) => void
    isPending?: boolean
  } = $props()

  let activeAction = $state<string | null>(null)
  let activeValue = $state<string>('')
  let showConfirm = $state(false)

  const currentAction = $derived(actions.find((a) => a.key === activeAction))

  function handleApplyClick() {
    showConfirm = true
  }

  function handleConfirm() {
    if (activeAction && activeValue) {
      onApply(activeAction, activeValue)
    }
    showConfirm = false
  }

  function handleCancel() {
    showConfirm = false
  }

  function reset() {
    activeAction = null
    activeValue = ''
    showConfirm = false
  }

  // Reset when selection clears
  $effect(() => {
    if (selectedCount === 0) reset()
  })
</script>

{#if selectedCount > 0}
  <div class="flex items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm">
    <span class="text-xs text-neutral-400">{selectedCount} selected</span>

    <select
      bind:value={activeAction}
      onchange={() => { activeValue = '' }}
      class="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
    >
      <option value={null}>Action...</option>
      {#each actions as action}
        <option value={action.key}>{action.label}</option>
      {/each}
    </select>

    {#if currentAction}
      <select
        bind:value={activeValue}
        class="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
      >
        <option value="">Select...</option>
        {#each currentAction.options as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>

      {#if activeValue}
        <button
          onclick={handleApplyClick}
          disabled={isPending}
          class="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          Apply
        </button>
      {/if}
    {/if}
  </div>

  {#if showConfirm}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div class="w-full max-w-sm rounded-xl border border-neutral-700 bg-neutral-900 p-6">
        <p class="mb-4 text-sm">
          {currentAction?.label} to <strong>{currentAction?.options.find((o) => o.value === activeValue)?.label}</strong> for <strong>{selectedCount}</strong> employee{selectedCount > 1 ? 's' : ''}?
        </p>
        <div class="flex justify-end gap-2">
          <button onclick={handleCancel} class="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-800">Cancel</button>
          <button
            onclick={handleConfirm}
            disabled={isPending}
            class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50"
          >
            {isPending ? 'Applying...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  {/if}
{/if}
