import * as pointsRepo from '../repositories/points'
import { writeAuditLog } from './audit'
import { createNotification } from './notifications'
import type { AuthUser } from '../middleware/auth'
import { withRLS } from '../repositories/base'
import type { ApproveRejectInput } from '@coms/shared/schemas'
import type { BulkPointActionInput, BulkResult, BulkResultItem } from '@coms/shared/schemas'

type ServiceContext = {
  readonly actor: AuthUser
  readonly ipAddress?: string
}

export async function approvePoint(
  id: string,
  input: ApproveRejectInput,
  ctx: ServiceContext,
) {
  return withRLS(ctx.actor, async (db) => {
    const result = await pointsRepo.getPointWithDetails(id, db)
    if (!result) throw new PointNotFoundError(id)

    const { point, category, user: targetUser } = result

    if (point.status !== 'pending') throw new PointNotPendingError(id)

    await assertCanApproveReject(ctx.actor, targetUser, db)

    const now = new Date()
    const updated = await pointsRepo.updatePointStatus(
      id,
      { status: 'active', approvedBy: ctx.actor.id, approvedAt: now },
      db,
    )

    await writeAuditLog(
      {
        actor: ctx.actor,
        action: 'POINT_APPROVED',
        entityType: 'achievement_points',
        entityId: id,
        newValue: { status: 'active', reason: input.reason ?? null },
        ipAddress: ctx.ipAddress,
      },
      db,
    )

    const categoryLabel = category.defaultName

    await createNotification(
      {
        branchId: ctx.actor.branchKey,
        userId: targetUser.id,
        type: 'point_approved',
        title: `Your ${categoryLabel} submission has been approved`,
        entityType: 'achievement_points',
        entityId: id,
      },
      db,
    )

    if (point.submittedBy !== targetUser.id) {
      await createNotification(
        {
          branchId: ctx.actor.branchKey,
          userId: point.submittedBy,
          type: 'point_approved',
          title: `Your ${categoryLabel} submission has been approved`,
          entityType: 'achievement_points',
          entityId: id,
        },
        db,
      )
    }

    return updated
  })
}

export async function rejectPoint(
  id: string,
  input: ApproveRejectInput,
  ctx: ServiceContext,
) {
  return withRLS(ctx.actor, async (db) => {
    const result = await pointsRepo.getPointWithDetails(id, db)
    if (!result) throw new PointNotFoundError(id)

    const { point, category, user: targetUser } = result

    if (point.status !== 'pending') throw new PointNotPendingError(id)

    await assertCanApproveReject(ctx.actor, targetUser, db)

    const now = new Date()
    const updated = await pointsRepo.updatePointStatus(
      id,
      { status: 'rejected', approvedBy: ctx.actor.id, approvedAt: now },
      db,
    )

    await writeAuditLog(
      {
        actor: ctx.actor,
        action: 'POINT_REJECTED',
        entityType: 'achievement_points',
        entityId: id,
        newValue: { status: 'rejected', reason: input.reason ?? null },
        ipAddress: ctx.ipAddress,
      },
      db,
    )

    const categoryLabel = category.defaultName
    const rejectionSuffix = input.reason ? `: ${input.reason}` : ''

    await createNotification(
      {
        branchId: ctx.actor.branchKey,
        userId: targetUser.id,
        type: 'point_rejected',
        title: `Your ${categoryLabel} submission has been rejected${rejectionSuffix}`,
        entityType: 'achievement_points',
        entityId: id,
      },
      db,
    )

    if (point.submittedBy !== targetUser.id) {
      await createNotification(
        {
          branchId: ctx.actor.branchKey,
          userId: point.submittedBy,
          type: 'point_rejected',
          title: `Your ${categoryLabel} submission has been rejected${rejectionSuffix}`,
          entityType: 'achievement_points',
          entityId: id,
        },
        db,
      )
    }

    return updated
  })
}

export async function revokePoint(
  id: string,
  input: ApproveRejectInput,
  ctx: ServiceContext,
) {
  if (ctx.actor.role !== 'hr' && ctx.actor.role !== 'admin') {
    throw new UnauthorizedApprovalError('Only HR or Admin can revoke points')
  }

  return withRLS(ctx.actor, async (db) => {
    const result = await pointsRepo.getPointWithDetails(id, db)
    if (!result) throw new PointNotFoundError(id)

    const { point, category, user: targetUser } = result

    if (point.status !== 'active') throw new PointNotActiveError(id)

    const now = new Date()
    const updated = await pointsRepo.updatePointStatus(
      id,
      { status: 'revoked', approvedBy: ctx.actor.id, approvedAt: now },
      db,
    )

    await writeAuditLog(
      {
        actor: ctx.actor,
        action: 'POINT_REVOKED',
        entityType: 'achievement_points',
        entityId: id,
        newValue: { status: 'revoked', reason: input.reason ?? null },
        ipAddress: ctx.ipAddress,
      },
      db,
    )

    const categoryLabel = category.defaultName
    const revokeSuffix = input.reason ? `: ${input.reason}` : ''

    await createNotification(
      {
        branchId: ctx.actor.branchKey,
        userId: targetUser.id,
        type: 'point_rejected',
        title: `Your ${categoryLabel} point has been revoked${revokeSuffix}`,
        entityType: 'achievement_points',
        entityId: id,
      },
      db,
    )

    return updated
  })
}

async function assertCanApproveReject(
  actor: AuthUser,
  targetUser: { id: string; teamKey: string | null },
  _db: Parameters<Parameters<typeof withRLS>[1]>[0],
) {
  if (actor.role === 'employee') {
    throw new UnauthorizedApprovalError('Employees cannot approve or reject points')
  }

  if (actor.role === 'leader') {
    if (!targetUser.teamKey) {
      throw new UnauthorizedApprovalError('Target user has no team assigned')
    }
  }
}

export async function bulkResolvePoints(
  input: BulkPointActionInput,
  ctx: ServiceContext,
): Promise<BulkResult> {
  const results: BulkResultItem[] = []

  for (const id of input.ids) {
    try {
      if (input.action === 'approve') {
        await approvePoint(id, { reason: input.reason }, ctx)
      } else {
        await rejectPoint(id, { reason: input.reason }, ctx)
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
export class PointNotFoundError extends Error {
  constructor(id: string) {
    super(`Point not found: ${id}`)
    this.name = 'PointNotFoundError'
  }
}

export class PointNotPendingError extends Error {
  constructor(id: string) {
    super(`Point is not pending approval: ${id}`)
    this.name = 'PointNotPendingError'
  }
}

export class UnauthorizedApprovalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnauthorizedApprovalError'
  }
}

export class PointNotActiveError extends Error {
  constructor(id: string) {
    super(`Point is not active: ${id}`)
    this.name = 'PointNotActiveError'
  }
}
