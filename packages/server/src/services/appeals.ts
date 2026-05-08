import { eq, and, sql } from 'drizzle-orm'
import { heroesProfiles, userConfigCache } from '@coms/shared/db/schema'
import * as appealsRepo from '../repositories/appeals'
import * as pointsRepo from '../repositories/points'
import { writeAuditLog } from './audit'
import { createNotification } from './notifications'
import type { AuthUser } from '../middleware/auth'
import { withRLS } from '../repositories/base'
import type { FileAppealInput, ResolveAppealInput, ListAppealsInput } from '@coms/shared/schemas'

type ServiceContext = {
  readonly actor: AuthUser
  readonly ipAddress?: string
}

export async function fileAppeal(
  achievementId: string,
  input: FileAppealInput,
  ctx: ServiceContext,
) {
  return withRLS(ctx.actor, async (db) => {
    const result = await pointsRepo.getPointWithDetails(achievementId, db)
    if (!result) throw new AchievementNotFoundError(achievementId)

    const { category, user: penalizedUser } = result

    // Only Penalti can be appealed
    if (category.code !== 'PENALTI') throw new NotPenaltiError()

    // Only the penalized user can appeal
    if (ctx.actor.id !== penalizedUser.id) throw new NotPenalizedUserError()

    // Check for existing open appeal
    const existing = await appealsRepo.findOpenByAchievementAndUser(
      achievementId,
      ctx.actor.id,
      db,
    )
    if (existing) throw new DuplicateOpenAppealError(achievementId)

    const created = await appealsRepo.create(
      {
        achievementId,
        appellantId: ctx.actor.id,
        reason: input.reason,
        status: 'open',
      },
      db,
    )

    // Freeze the point during appeal
    await pointsRepo.updatePointStatus(
      achievementId,
      { status: 'frozen' },
      db,
    )

    await writeAuditLog(
      {
        actor: ctx.actor,
        action: 'APPEAL_FILED',
        entityType: 'appeals',
        entityId: created.id,
        newValue: {
          achievementId,
          reason: input.reason,
        },
        ipAddress: ctx.ipAddress,
      },
      db,
    )

    // Notify HR users in branch for resolution
    const hrUsers = await db
      .select({ id: heroesProfiles.id })
      .from(heroesProfiles)
      .innerJoin(userConfigCache, eq(heroesProfiles.id, userConfigCache.portalSub))
      .where(
        and(
          ctx.actor.branchKey !== null ? eq(heroesProfiles.branchKey, ctx.actor.branchKey) : undefined,
          sql`${userConfigCache.config}->>'role' = 'hr'`,
          eq(heroesProfiles.isActive, true),
        ),
      )

    for (const hr of hrUsers) {
      await createNotification(
        {
          branchKey: ctx.actor.branchKey,
          userId: hr.id,
          type: 'appeal_needs_resolution',
          title: `${ctx.actor.name} has appealed a Penalti — needs resolution`,
          entityType: 'appeals',
          entityId: created.id,
        },
        db,
      )
    }

    return created
  })
}

export async function resolveAppeal(
  appealId: string,
  input: ResolveAppealInput,
  ctx: ServiceContext,
) {
  return withRLS(ctx.actor, async (db) => {
    const result = await appealsRepo.getByIdWithDetails(appealId, db)
    if (!result) throw new AppealNotFoundError(appealId)

    const { appeal, appellant } = result

    if (appeal.status !== 'open') throw new AppealNotOpenError(appealId)

    // Only HR or admin can resolve
    if (ctx.actor.role !== 'hr' && ctx.actor.role !== 'admin') {
      throw new InsufficientRoleError()
    }

    const now = new Date()
    const updated = await appealsRepo.resolve(
      appealId,
      {
        status: input.status,
        resolvedBy: ctx.actor.id,
        resolvedAt: now,
        resolutionNote: input.resolutionNote,
      },
      db,
    )

    // Update achievement point status based on resolution
    const newPointStatus = input.status === 'upheld' ? 'revoked' : 'active'
    await pointsRepo.updatePointStatus(
      appeal.achievementId,
      {
        status: newPointStatus,
        ...(input.status === 'upheld'
          ? { revokedBy: ctx.actor.id, revokedAt: now, revokeReason: `Appeal upheld: ${input.resolutionNote}` }
          : {}),
      },
      db,
    )

    await writeAuditLog(
      {
        actor: ctx.actor,
        action: 'APPEAL_RESOLVED',
        entityType: 'appeals',
        entityId: appealId,
        newValue: {
          status: input.status,
          resolutionNote: input.resolutionNote,
          achievementId: appeal.achievementId,
          newPointStatus,
        },
        ipAddress: ctx.ipAddress,
      },
      db,
    )

    const statusLabel = input.status === 'upheld' ? 'upheld (Penalti removed)' : 'overturned (Penalti stands)'

    // Notify appellant
    await createNotification(
      {
        branchKey: ctx.actor.branchKey,
        userId: appellant.id,
        type: 'appeal_resolved',
        title: `Your appeal has been ${statusLabel}`,
        entityType: 'appeals',
        entityId: appealId,
      },
      db,
    )

    return updated
  })
}

export async function listAppeals(
  achievementId: string,
  input: ListAppealsInput,
  ctx: ServiceContext,
) {
  const { rows, total } = await withRLS(ctx.actor, (db) =>
    appealsRepo.listByAchievement(
      achievementId,
      { page: input.page, limit: input.limit },
      db,
    ),
  )

  return {
    appeals: rows,
    meta: { total, page: input.page, limit: input.limit },
  }
}

// Domain errors
export class AchievementNotFoundError extends Error {
  constructor(id: string) {
    super(`Achievement point not found: ${id}`)
    this.name = 'AchievementNotFoundError'
  }
}

export class NotPenaltiError extends Error {
  constructor() {
    super('Only Penalti submissions can be appealed')
    this.name = 'NotPenaltiError'
  }
}

export class NotPenalizedUserError extends Error {
  constructor() {
    super('Only the penalized user can appeal')
    this.name = 'NotPenalizedUserError'
  }
}

export class DuplicateOpenAppealError extends Error {
  constructor(achievementId: string) {
    super(`An open appeal already exists for achievement: ${achievementId}`)
    this.name = 'DuplicateOpenAppealError'
  }
}

export class InsufficientRoleError extends Error {
  constructor() {
    super('Insufficient role for this action')
    this.name = 'InsufficientRoleError'
  }
}

export class AppealNotFoundError extends Error {
  constructor(id: string) {
    super(`Appeal not found: ${id}`)
    this.name = 'AppealNotFoundError'
  }
}

export class AppealNotOpenError extends Error {
  constructor(id: string) {
    super(`Appeal is not open: ${id}`)
    this.name = 'AppealNotOpenError'
  }
}
