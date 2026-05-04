import { eq, and, desc, count } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { pointSummaries, achievementPoints, pointCategories, heroesProfiles } from '@coms/shared/db/schema'
import { withRLS } from '../repositories/base'
import { getPointImpactSettings } from './settings-cache'
import type { AuthUser } from '../middleware/auth'

type ServiceContext = {
  readonly actor: AuthUser
  readonly ipAddress?: string
}

export type DashboardSummary = {
  bintangCount: number
  poinAhaBalance: number
  penaltiCount: number
  pendingCount: number
}

export type ActivityItem = {
  id: string
  categoryCode: string
  categoryName: string
  points: number
  status: string
  reason: string
  userName: string
  userAvatarUrl: string | null
  submitterName: string
  createdAt: string
}

export async function getSummary(ctx: ServiceContext): Promise<DashboardSummary> {
  const { bintangPointImpact, penaltiPointImpact } = await getPointImpactSettings()

  return withRLS(ctx.actor, async (db) => {

    const summaryRows = await db
      .select({
        bintangCount: pointSummaries.bintangCount,
        penaltiPointsSum: pointSummaries.penaltiPointsSum,
        directPoinAha: pointSummaries.directPoinAha,
        redeemedTotal: pointSummaries.redeemedTotal,
      })
      .from(pointSummaries)
      .where(eq(pointSummaries.userId, ctx.actor.id))
      .limit(1)

    const summary = summaryRows[0]
    const bintangCount = summary?.bintangCount ?? 0
    const penaltiPointsSum = summary?.penaltiPointsSum ?? 0
    const directPoinAha = summary?.directPoinAha ?? 0
    const redeemedTotal = summary?.redeemedTotal ?? 0

    const poinAhaBalance =
      directPoinAha + bintangCount * bintangPointImpact - penaltiPointsSum * penaltiPointImpact - redeemedTotal

    const pendingCount = await getPendingCount(ctx, db)

    return {
      bintangCount,
      poinAhaBalance,
      penaltiCount: penaltiPointsSum,
      pendingCount,
    }
  })
}

async function getPendingCount(
  ctx: ServiceContext,
  db: Parameters<Parameters<typeof withRLS>[1]>[0],
): Promise<number> {
  const role = ctx.actor.role

  if (role === 'employee') return 0

  if (role === 'leader') {
    const actorTeamKey = ctx.actor.teamKey
    if (!actorTeamKey) return 0

    const rows = await db
      .select({ cnt: count() })
      .from(achievementPoints)
      .innerJoin(heroesProfiles, eq(achievementPoints.userId, heroesProfiles.id))
      .where(
        and(
          eq(achievementPoints.status, 'pending'),
          eq(heroesProfiles.teamKey, actorTeamKey),
        ),
      )
    return Number(rows[0]?.cnt ?? 0)
  }

  // hr / admin — all pending in branch
  const actorBranchKey = ctx.actor.branchKey
  const rows = await db
    .select({ cnt: count() })
    .from(achievementPoints)
    .innerJoin(heroesProfiles, eq(achievementPoints.userId, heroesProfiles.id))
    .where(
      and(
        eq(achievementPoints.status, 'pending'),
        actorBranchKey !== null ? eq(heroesProfiles.branchKey, actorBranchKey) : undefined,
      ),
    )
  return Number(rows[0]?.cnt ?? 0)
}

export async function getRecentActivity(ctx: ServiceContext): Promise<ActivityItem[]> {
  const submitter = alias(heroesProfiles, 'submitter')

  return withRLS(ctx.actor, async (db) => {
    const rows = await db
      .select({
        id: achievementPoints.id,
        categoryCode: pointCategories.code,
        categoryName: pointCategories.defaultName,
        points: achievementPoints.points,
        status: achievementPoints.status,
        reason: achievementPoints.reason,
        userName: heroesProfiles.name,
        userAvatarUrl: heroesProfiles.avatarUrl,
        submitterName: submitter.name,
        createdAt: achievementPoints.createdAt,
      })
      .from(achievementPoints)
      .innerJoin(heroesProfiles, eq(achievementPoints.userId, heroesProfiles.id))
      .innerJoin(submitter, eq(achievementPoints.submittedBy, submitter.id))
      .innerJoin(pointCategories, eq(achievementPoints.categoryId, pointCategories.id))
      .where(
        ctx.actor.branchKey !== null
          ? eq(heroesProfiles.branchKey, ctx.actor.branchKey)
          : undefined,
      )
      .orderBy(desc(achievementPoints.createdAt))
      .limit(10)

    return rows.map((row) => ({
      id: row.id,
      categoryCode: row.categoryCode,
      categoryName: row.categoryName,
      points: row.points,
      status: row.status,
      reason: row.reason,
      userName: row.userName,
      userAvatarUrl: row.userAvatarUrl,
      submitterName: row.submitterName ?? 'Unknown',
      createdAt: row.createdAt.toISOString(),
    }))
  })
}
