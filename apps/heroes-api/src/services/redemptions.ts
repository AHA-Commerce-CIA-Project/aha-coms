import { eq, inArray } from 'drizzle-orm'
import { redemptions as redemptionsTable, auditLogs, rewards } from '@coms-portal/heroes-shared/db/schema'
import * as redemptionsRepo from '../repositories/redemptions'
import { writeAuditLog } from './audit'
import { createNotification } from './notifications'
import type { AuthUser } from '../middleware/auth'
import { withRLS } from '../repositories/base'
import type {
  RequestRedemptionInput,
  ListRedemptionsInput,
  ResolveRedemptionInput,
} from '@coms-portal/heroes-shared/schemas'
import type { BulkRedemptionActionInput, BulkResult, BulkResultItem } from '@coms-portal/heroes-shared/schemas'

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
        branchKey: ctx.actor.branchKey,
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
        branchKey: redemption.branchKey ?? ctx.actor.branchKey,
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
        branchKey: redemption.branchKey ?? ctx.actor.branchKey,
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

  const now = new Date()
  const newStatus = input.action === 'approve' ? 'approved' : 'rejected'
  const action = input.action === 'approve' ? 'REDEMPTION_APPROVED' : 'REDEMPTION_REJECTED'

  const actorSnapshot = {
    id: ctx.actor.id,
    name: ctx.actor.name,
    email: ctx.actor.email,
    role: ctx.actor.role,
  }

  return withRLS(ctx.actor, async (db) => {
    // Single batched status UPDATE for all ids
    const statusData =
      input.action === 'approve'
        ? { status: 'approved' as const, approvedBy: ctx.actor.id, approvedAt: now, updatedAt: now }
        : { status: 'rejected' as const, rejectionReason: input.rejectionReason ?? null, updatedAt: now }

    await db
      .update(redemptionsTable)
      .set(statusData)
      .where(inArray(redemptionsTable.id, input.ids))

    // Single batched audit INSERT for all ids
    const auditRows = input.ids.map((id) => ({
      branchKey: ctx.actor.branchKey,
      actorId: ctx.actor.id,
      action,
      entityType: 'redemptions' as const,
      entityId: id,
      oldValue: null,
      newValue: {
        status: newStatus,
        ...(input.action === 'approve'
          ? { approvedBy: ctx.actor.id }
          : { rejectionReason: input.rejectionReason }),
        _actor: actorSnapshot,
      },
      ipAddress: ctx.ipAddress ?? null,
    }))

    await db.insert(auditLogs).values(auditRows)

    const results: BulkResultItem[] = input.ids.map((id) => ({ id, success: true }))
    return {
      processed: input.ids.length,
      succeeded: input.ids.length,
      failed: 0,
      results,
    }
  })
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
