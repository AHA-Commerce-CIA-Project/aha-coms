import * as rewardsRepo from '../repositories/rewards'
import type { AuthUser } from '../middleware/auth'
import { withRLS } from '../repositories/base'
import type { CreateRewardInput, UpdateRewardInput, ListRewardsInput } from '@coms/shared/schemas'

type ServiceContext = {
  readonly actor: AuthUser
  readonly ipAddress?: string
}

export async function listRewards(input: ListRewardsInput, ctx: ServiceContext) {
  const { rows, total } = await withRLS(ctx.actor, (db) =>
    rewardsRepo.listRewards({ page: input.page, limit: input.limit }, db),
  )

  return {
    rewards: rows,
    meta: { total, page: input.page, limit: input.limit },
  }
}

export async function getRewardById(id: string, ctx: ServiceContext) {
  const reward = await withRLS(ctx.actor, (db) =>
    rewardsRepo.getRewardById(id, db),
  )
  if (!reward) throw new RewardNotFoundError(id)
  return reward
}

export async function createReward(input: CreateRewardInput, ctx: ServiceContext) {
  if (ctx.actor.role !== 'hr' && ctx.actor.role !== 'admin') {
    throw new InsufficientRoleError()
  }

  const created = await withRLS(ctx.actor, (db) =>
    rewardsRepo.createReward(
      {
        branchId: ctx.actor.branchKey,
        name: input.name,
        description: input.description,
        pointCost: input.pointCost,
        imageUrl: input.imageUrl,
      },
      db,
    ),
  )

  return created
}

export async function updateReward(
  id: string,
  input: UpdateRewardInput,
  ctx: ServiceContext,
) {
  if (ctx.actor.role !== 'hr' && ctx.actor.role !== 'admin') {
    throw new InsufficientRoleError()
  }

  const updated = await withRLS(ctx.actor, async (db) => {
    const reward = await rewardsRepo.getRewardById(id, db)
    if (!reward) throw new RewardNotFoundError(id)

    return rewardsRepo.updateReward(id, input, db)
  })

  return updated
}

// Domain errors
export class RewardNotFoundError extends Error {
  constructor(id: string) {
    super(`Reward not found: ${id}`)
    this.name = 'RewardNotFoundError'
  }
}

export class InsufficientRoleError extends Error {
  constructor() {
    super('Insufficient role for this action')
    this.name = 'InsufficientRoleError'
  }
}
