import { eq, and, sql } from 'drizzle-orm'
import { heroesProfiles, userConfigCache } from '@coms/shared/db/schema'
import * as challengesRepo from '../repositories/challenges'
import * as pointsRepo from '../repositories/points'
import { writeAuditLog } from './audit'
import { createNotification } from './notifications'
import type { AuthUser } from '../middleware/auth'
import { withRLS } from '../repositories/base'
import type { FileChallengeInput, ResolveChallengeInput, ListChallengesInput } from '@coms/shared/schemas'

type ServiceContext = {
  readonly actor: AuthUser
  readonly ipAddress?: string
}

export async function fileChallenge(
  achievementId: string,
  input: FileChallengeInput,
  ctx: ServiceContext,
) {
  return withRLS(ctx.actor, async (db) => {
    const result = await pointsRepo.getPointWithDetails(achievementId, db)
    if (!result) throw new AchievementNotFoundError(achievementId)

    const { category, user: penalizedUser } = result

    // Only Penalti can be challenged
    if (category.code !== 'PENALTI') throw new NotPenaltiError()

    // Only leaders can file challenges
    if (ctx.actor.role !== 'leader' && ctx.actor.role !== 'admin' && ctx.actor.role !== 'hr') {
      throw new InsufficientRoleError()
    }

    // Cannot challenge your own penalty
    if (ctx.actor.id === penalizedUser.id) {
      throw new CannotChallengeSelfError()
    }

    const created = await challengesRepo.create(
      {
        achievementId,
        challengerId: ctx.actor.id,
        reason: input.reason,
        status: 'open',
      },
      db,
    )

    // Freeze the point during challenge
    await pointsRepo.updatePointStatus(
      achievementId,
      { status: 'challenged' },
      db,
    )

    await writeAuditLog(
      {
        actor: ctx.actor,
        action: 'CHALLENGE_FILED',
        entityType: 'challenges',
        entityId: created.id,
        newValue: {
          achievementId,
          reason: input.reason,
          penalizedUserId: penalizedUser.id,
        },
        ipAddress: ctx.ipAddress,
      },
      db,
    )

    // Notify penalized user
    await createNotification(
      {
        branchKey: ctx.actor.branchKey,
        userId: penalizedUser.id,
        type: 'challenge_filed',
        title: `Your Penalti has been challenged by ${ctx.actor.name}`,
        entityType: 'challenges',
        entityId: created.id,
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
          type: 'challenge_needs_resolution',
          title: `A Penalti challenge has been filed by ${ctx.actor.name} — needs resolution`,
          entityType: 'challenges',
          entityId: created.id,
        },
        db,
      )
    }

    return created
  })
}

export async function resolveChallenge(
  challengeId: string,
  input: ResolveChallengeInput,
  ctx: ServiceContext,
) {
  return withRLS(ctx.actor, async (db) => {
    const result = await challengesRepo.getByIdWithDetails(challengeId, db)
    if (!result) throw new ChallengeNotFoundError(challengeId)

    const { challenge, challenger } = result

    if (challenge.status !== 'open') throw new ChallengeNotOpenError(challengeId)

    // Only HR or admin can resolve
    if (ctx.actor.role !== 'hr' && ctx.actor.role !== 'admin') {
      throw new InsufficientRoleError()
    }

    const now = new Date()
    const updated = await challengesRepo.resolve(
      challengeId,
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
      challenge.achievementId,
      {
        status: newPointStatus,
        ...(input.status === 'upheld'
          ? { revokedBy: ctx.actor.id, revokedAt: now, revokeReason: `Challenge upheld: ${input.resolutionNote}` }
          : {}),
      },
      db,
    )

    await writeAuditLog(
      {
        actor: ctx.actor,
        action: 'CHALLENGE_RESOLVED',
        entityType: 'challenges',
        entityId: challengeId,
        newValue: {
          status: input.status,
          resolutionNote: input.resolutionNote,
          achievementId: challenge.achievementId,
          newPointStatus,
        },
        ipAddress: ctx.ipAddress,
      },
      db,
    )

    // Fetch penalized user for notification
    const pointResult = await pointsRepo.getPointWithDetails(challenge.achievementId, db)
    const penalizedUserId = pointResult?.user.id

    const statusLabel = input.status === 'upheld' ? 'upheld (Penalti removed)' : 'overturned (Penalti stands)'

    // Notify challenger
    await createNotification(
      {
        branchKey: ctx.actor.branchKey,
        userId: challenger.id,
        type: 'challenge_resolved',
        title: `Your challenge has been ${statusLabel}`,
        entityType: 'challenges',
        entityId: challengeId,
      },
      db,
    )

    // Notify penalized user
    if (penalizedUserId && penalizedUserId !== challenger.id) {
      await createNotification(
        {
          branchKey: ctx.actor.branchKey,
          userId: penalizedUserId,
          type: 'challenge_resolved',
          title: `Challenge on your Penalti has been ${statusLabel}`,
          entityType: 'challenges',
          entityId: challengeId,
        },
        db,
      )
    }

    return updated
  })
}

export async function listChallenges(
  achievementId: string,
  input: ListChallengesInput,
  ctx: ServiceContext,
) {
  const { rows, total } = await withRLS(ctx.actor, (db) =>
    challengesRepo.listByAchievement(
      achievementId,
      { page: input.page, limit: input.limit },
      db,
    ),
  )

  return {
    challenges: rows,
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
    super('Only Penalti submissions can be challenged')
    this.name = 'NotPenaltiError'
  }
}

export class InsufficientRoleError extends Error {
  constructor() {
    super('Insufficient role for this action')
    this.name = 'InsufficientRoleError'
  }
}

export class CannotChallengeSelfError extends Error {
  constructor() {
    super('Cannot challenge your own penalty')
    this.name = 'CannotChallengeSelfError'
  }
}

export class ChallengeNotFoundError extends Error {
  constructor(id: string) {
    super(`Challenge not found: ${id}`)
    this.name = 'ChallengeNotFoundError'
  }
}

export class ChallengeNotOpenError extends Error {
  constructor(id: string) {
    super(`Challenge is not open: ${id}`)
    this.name = 'ChallengeNotOpenError'
  }
}
