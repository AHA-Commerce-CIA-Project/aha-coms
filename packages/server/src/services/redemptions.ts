import { eq } from 'drizzle-orm'
import { rewards } from '@coms/shared/db/schema'
import * as redemptionsRepo from '../repositories/redemptions'
import { writeAuditLog } from './audit'
import { createNotification } from './notifications'
import type { AuthUser } from '../middleware/auth'
import { withRLS } from '../repositories/base'
import type {
  RequestRedemptionInput,
  ListRedemptionsInput,
  ResolveRedemptionInput,
} from '@coms/shared/schemas'
import type { BulkRedemptionActionInput, BulkResult, BulkResultItem } from '@coms/shared/schemas'

type ServiceContext = {
  readonly actor: AuthUser
  readonly ipAddress?: string
}

export async function requestRedemption(
  input: RequestRedemptionInput,
  ctx: ServiceContext,
) {
  return withRLS(ctx.actor, async (db) => {
    const [reward] = await db
      .select()
      .from(rewards)
      .where(eq(rewards.id, input.rewardId))
      .limit(1)

    if (!reward) throw new RewardNotFoundError(input.rewardId)
    if (!reward.isActive) throw new RewardNotActiveError(input.rewardId)

    const created = await redemptionsRepo.createRedemption(
      {
        branchId: ctx.actor.branchId,
        userId: ctx.actor.id,
        rewardId: input.rewardId,
        pointsSpent: reward.pointCost,
        notes: input.notes ?? null,
        status: 'pending',
      },
      db,
    )

    await writeAuditLog(
      {
        actor: ctx.actor,
        action: 'REDEMPTION_REQUESTED',
        entityType: 'redemptions',
        entityId: created.id,
        newValue: {
          rewardId: input.rewardId,
          pointsSpent: reward.pointCost,
          notes: input.notes,
        },
        ipAddress: ctx.ipAddress,
      },
      db,
    )

    return created
  })
}

export async function listRedemptions(
  input: ListRedemptionsInput,
  ctx: ServiceContext,
) {
  const forceOwn = ctx.actor.role === 'employee'
  const filterByUser = forceOwn || input.mine ? ctx.actor.id : undefined

  const { rows, total } = await withRLS(ctx.actor, (db) =>
    redemptionsRepo.listRedemptions(
      { page: input.page, limit: input.limit },
      {
        status: input.status,
        userId: filterByUser,
        search: input.search,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      },
      db,
    ),
  )

  return {
    redemptions: rows,
    meta: { total, page: input.page, limit: input.limit },
  }
}

export async function getRedemptionById(id: string, ctx: ServiceContext) {
  const redemption = await withRLS(ctx.actor, (db) =>
    redemptionsRepo.getRedemptionById(id, db),
  )
  if (!redemption) throw new RedemptionNotFoundError(id)
  return redemption
}

export async function approveRedemption(id: string, ctx: ServiceContext) {
  if (ctx.actor.role !== 'hr' && ctx.actor.role !== 'admin') {
    throw new InsufficientRoleError()
  }

  return withRLS(ctx.actor, async (db) => {
    const redemption = await redemptionsRepo.getRedemptionById(id, db)
    if (!redemption) throw new RedemptionNotFoundError(id)
    if (redemption.status !== 'pending') throw new RedemptionNotPendingError(id)

    const now = new Date()
    const updated = await redemptionsRepo.updateRedemptionStatus(
      id,
      {
        status: 'approved',
        approvedBy: ctx.actor.id,
        approvedAt: now,
      },
      db,
    )

    await writeAuditLog(
      {
        actor: ctx.actor,
        action: 'REDEMPTION_APPROVED',
        entityType: 'redemptions',
        entityId: id,
        newValue: { status: 'approved', approvedBy: ctx.actor.id },
        ipAddress: ctx.ipAddress,
      },
      db,
    )

    await createNotification(
      {
        branchId: redemption.branchId ?? ctx.actor.branchId,
        userId: redemption.userId,
        type: 'redemption_approved',
        title: `Your redemption request for "${redemption.rewardName}" has been approved`,
        entityType: 'redemptions',
        entityId: id,
      },
      db,
    )

    return updated
  })
}

export async function rejectRedemption(
  id: string,
  input: ResolveRedemptionInput,
  ctx: ServiceContext,
) {
  if (ctx.actor.role !== 'hr' && ctx.actor.role !== 'admin') {
    throw new InsufficientRoleError()
  }

  return withRLS(ctx.actor, async (db) => {
    const redemption = await redemptionsRepo.getRedemptionById(id, db)
    if (!redemption) throw new RedemptionNotFoundError(id)
    if (redemption.status !== 'pending') throw new RedemptionNotPendingError(id)

    const updated = await redemptionsRepo.updateRedemptionStatus(
      id,
      {
        status: 'rejected',
        rejectionReason: input.rejectionReason,
      },
      db,
    )

    await writeAuditLog(
      {
        actor: ctx.actor,
        action: 'REDEMPTION_REJECTED',
        entityType: 'redemptions',
        entityId: id,
        newValue: {
          status: 'rejected',
          rejectionReason: input.rejectionReason,
        },
        ipAddress: ctx.ipAddress,
      },
      db,
    )

    await createNotification(
      {
        branchId: redemption.branchId ?? ctx.actor.branchId,
        userId: redemption.userId,
        type: 'redemption_rejected',
        title: `Your redemption request for "${redemption.rewardName}" has been rejected`,
        entityType: 'redemptions',
        entityId: id,
      },
      db,
    )

    return updated
  })
}

export async function bulkResolveRedemptions(
  input: BulkRedemptionActionInput,
  ctx: ServiceContext,
): Promise<BulkResult> {
  if (ctx.actor.role !== 'hr' && ctx.actor.role !== 'admin') {
    throw new InsufficientRoleError()
  }

  const results: BulkResultItem[] = []

  for (const id of input.ids) {
    try {
      if (input.action === 'approve') {
        await approveRedemption(id, ctx)
      } else {
        await rejectRedemption(id, { status: 'rejected', rejectionReason: input.rejectionReason }, ctx)
      }
      results.push({ id, success: true })
    } catch (err) {
      results.push({ id, success: false, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  const succeeded = results.filter((r) => r.success).length
  return { processed: input.ids.length, succeeded, failed: input.ids.length - succeeded, results }
}

// Domain errors
export class RewardNotFoundError extends Error {
  constructor(id: string) {
    super(`Reward not found: ${id}`)
    this.name = 'RewardNotFoundError'
  }
}

export class RewardNotActiveError extends Error {
  constructor(id: string) {
    super(`Reward is not active: ${id}`)
    this.name = 'RewardNotActiveError'
  }
}

export class InsufficientBalanceError extends Error {
  constructor(required: number, available: number) {
    super(`Insufficient balance: required ${required}, available ${available}`)
    this.name = 'InsufficientBalanceError'
  }
}

export class RedemptionNotFoundError extends Error {
  constructor(id: string) {
    super(`Redemption not found: ${id}`)
    this.name = 'RedemptionNotFoundError'
  }
}

export class RedemptionNotPendingError extends Error {
  constructor(id: string) {
    super(`Redemption is not pending: ${id}`)
    this.name = 'RedemptionNotPendingError'
  }
}

export class InsufficientRoleError extends Error {
  constructor() {
    super('Insufficient role for this action')
    this.name = 'InsufficientRoleError'
  }
}
