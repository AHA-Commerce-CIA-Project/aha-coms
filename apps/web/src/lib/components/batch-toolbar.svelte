<script lang="ts">
  import {
    Button,
    Select, SelectTrigger, SelectContent, SelectItem,
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
  } from '@coms-portal/ui/primitives'

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
    entityLabel = 'item',
  }: {
    selectedCount: number
    actions: BatchAction[]
    onApply: (action: string, value: string) => void
    isPending?: boolean
    entityLabel?: string
  } = $props()

  let activeAction = $state<string | undefined>(undefined)
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
    activeAction = undefined
    activeValue = ''
    showConfirm = false
  }

  // Reset when selection clears
  $effect(() => {
    if (selectedCount === 0) reset()
  })
</script>

{#if selectedCount > 0}
  <div class="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2 text-sm">
    <span class="text-xs text-muted-foreground">{selectedCount} selected</span>

    <Select
      type="single"
      value={activeAction}
      onValueChange={(v) => { activeAction = v; activeValue = '' }}
    >
      <SelectTrigger size="sm" class="w-32">
        <span>{currentAction?.label ?? 'Action...'}</span>
      </SelectTrigger>
      <SelectContent>
        {#each actions as action}
          <SelectItem value={action.key} label={action.label} />
        {/each}
      </SelectContent>
    </Select>

    {#if currentAction}
      <Select
        type="single"
        value={activeValue}
        onValueChange={(v) => { activeValue = v ?? '' }}
      >
        <SelectTrigger size="sm" class="w-32">
          <span>{currentAction.options.find((o) => o.value === activeValue)?.label ?? 'Select...'}</span>
        </SelectTrigger>
        <SelectContent>
          {#each currentAction.options as opt}
            <SelectItem value={opt.value} label={opt.label} />
          {/each}
        </SelectContent>
      </Select>

      {#if activeValue}
        <Button
          onclick={handleApplyClick}
          disabled={isPending}
          size="sm"
        >
          Apply
        </Button>
      {/if}
    {/if}
  </div>

  <Dialog bind:open={showConfirm}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Confirm Bulk Action</DialogTitle>
        <DialogDescription>This will apply the selected action to {selectedCount} item(s). This cannot be undone.</DialogDescription>
      </DialogHeader>
      <p class="text-sm">
        {currentAction?.label} to <strong>{currentAction?.options.find((o) => o.value === activeValue)?.label}</strong> for <strong>{selectedCount}</strong> {entityLabel}{selectedCount > 1 ? 's' : ''}?
      </p>
      <DialogFooter>
        <Button variant="outline" onclick={handleCancel}>Cancel</Button>
        <Button
          onclick={handleConfirm}
          disabled={isPending}
        >
          {isPending ? 'Applying...' : 'Confirm'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
{/if}
