<script lang="ts">
  import { toast } from 'svelte-sonner'
  import { api } from '$lib/api/client'
  import { getErrorMessage } from '$lib/api/client'
  import { Textarea, Button } from '@coms-portal/ui/primitives'
  import { Send, User as UserIcon } from 'lucide-svelte'

  interface Comment {
    id: string
    body: string
    createdAt: string
    user?: { name?: string; avatarUrl?: string | null } | null
  }

  interface Props {
    entityId: string
    entityType: 'achievement' | 'challenge' | 'appeal'
    comments?: Comment[]
  }

  let { entityId, entityType, comments = [] }: Props = $props()

  let localComments = $derived(comments)
  let body = $state('')
  let isSubmitting = $state(false)

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!body.trim() || isSubmitting) return

    isSubmitting = true
    try {
      const result = await api.api.v1.comments.post({ entityType, entityId, body: body.trim() })
      if (result.error) {
        toast.error(getErrorMessage(result.error, 'Failed to post comment'))
        return
      }
      if (result.data) {
        localComments = [...localComments, result.data as unknown as Comment]
      }
      body = ''
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to post comment')
    } finally {
      isSubmitting = false
    }
  }
</script>

<div class="space-y-6 pt-4">
  <h3 class="text-sm font-semibold text-foreground flex items-center gap-2">
    <span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
    Comments ({localComments.length})
  </h3>

  <div class="space-y-5">
    {#if localComments.length === 0}
      <p class="text-xs text-muted-foreground text-center py-4">
        No comments yet. Start the conversation!
      </p>
    {:else}
      {#each localComments as comment (comment.id)}
        <div class="flex gap-3">
          <div class="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
            {#if comment.user?.avatarUrl}
              <img src={comment.user.avatarUrl} alt="" class="h-full w-full rounded-full object-cover" />
            {:else}
              <UserIcon class="h-4 w-4 text-muted-foreground" />
            {/if}
          </div>
          <div class="flex-1 space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-foreground">{comment.user?.name ?? 'Unknown'}</span>
              <span class="text-[10px] text-muted-foreground">
                {new Date(comment.createdAt).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div class="text-sm text-foreground leading-relaxed">{comment.body}</div>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <form onsubmit={onSubmit} class="relative mt-4">
    <Textarea
      placeholder="Write a comment..."
      bind:value={body}
      class="pr-12 min-h-[100px] rounded-2xl bg-muted/30 border-none focus-visible:ring-1 focus-visible:ring-primary transition-all"
    />
    <Button
      type="submit"
      size="icon"
      disabled={!body.trim() || isSubmitting}
      class="absolute right-2 bottom-2 h-8 w-8 rounded-xl bg-primary hover:bg-primary/80 shadow-md shadow-primary/10"
    >
      <Send class="h-4 w-4" />
    </Button>
  </form>
</div>
