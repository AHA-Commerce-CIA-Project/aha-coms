<script lang="ts">
  import { Button } from '@coms-portal/ui/primitives'
  import ChallengeDialog from './ChallengeDialog.svelte'
  import AppealDialog from './AppealDialog.svelte'
  import { userState } from '$lib/state/userState.svelte'
  import * as m from '$lib/paraglide/messages'

  interface PointData {
    id: string
    userId?: string
    submitter?: { id?: string } | null
    status: string
    category?: { code?: string } | null
  }

  interface Props {
    point: PointData
  }

  let { point }: Props = $props()

  const user = $derived(userState.current)
  const isPenalti = $derived(point?.category?.code === 'PENALTI')
  const isActive = $derived(point?.status === 'active')
  const isRecipient = $derived(user?.id === point?.userId)
  const isSubmitter = $derived(user?.id === point?.submitter?.id)
  const isLeader = $derived(user?.role === 'leader')

  const canChallenge = $derived(isLeader && !isSubmitter && isPenalti && isActive)
  const canAppeal = $derived(isRecipient && isPenalti && isActive)

  let challengeOpen = $state(false)
  let appealOpen = $state(false)
</script>

{#if canChallenge || canAppeal}
  <div class="flex flex-col gap-2 w-full mt-4">
    {#if canChallenge}
      <Button
        class="w-full btn-gradient-purple rounded-xl py-6 text-base font-semibold shadow-lg shadow-purple-900/20"
        onclick={() => (challengeOpen = true)}
      >
        {m.point_action_challenge()}
      </Button>
      <ChallengeDialog pointId={point.id} bind:open={challengeOpen} />
    {/if}

    {#if canAppeal}
      <Button
        class="w-full btn-gradient-blue rounded-xl py-6 text-base font-semibold shadow-lg shadow-blue-900/20"
        onclick={() => (appealOpen = true)}
      >
        {m.point_action_appeal()}
      </Button>
      <AppealDialog pointId={point.id} bind:open={appealOpen} />
    {/if}
  </div>
{/if}
