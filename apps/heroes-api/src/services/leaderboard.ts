import { eq, and, count, sql, desc } from 'drizzle-orm'
import { pointSummaries, heroesProfiles, achievementPoints, pointCategories } from '@coms/shared/db/schema'
import { withRLS } from '../repositories/base'
import { getPointImpactSettings } from './settings-cache'
import type { AuthUser } from '../middleware/auth'

type ServiceContext = {
  readonly actor: AuthUser
  readonly ipAddress?: string
}

export type LeaderboardInput = {
  type: 'bintang' | 'poin_aha' | 'penalti'
  teamId?: string
  months?: number
  page: number
  limit: number
}

export type LeaderboardEntry = {
  rank: number
  userId: string
  name: string
  avatarUrl: string | null
  teamId: string | null
  score: number
  bintangCount: number
  penaltiCount: number
}

export async function getLeaderboard(
  input: LeaderboardInput,
  ctx: ServiceContext,
): Promise<{ entries: LeaderboardEntry[]; meta: { total: number; page: number; limit: number } }> {
  const { bintangPointImpact, penaltiPointImpact } = await getPointImpactSettings()

  // Time-filtered path: aggregate from achievement_points directly
  const months = input.months
  if (months !== undefined) {
    return getLeaderboardFiltered({ ...input, months }, ctx, bintangPointImpact, penaltiPointImpact)
  }

  return withRLS(ctx.actor, async (db) => {
    const branchCondition =
      ctx.actor.branchKey !== null ? eq(heroesProfiles.branchKey, ctx.actor.branchKey) : undefined

    const whereConditions = input.teamId
      ? and(branchCondition, eq(heroesProfiles.isActive, true), eq(heroesProfiles.teamKey, input.teamId))
      : and(branchCondition, eq(heroesProfiles.isActive, true))

    // Compute poinAhaBalance in SQL so we can ORDER BY and LIMIT/OFFSET in the DB
    const poinAhaBalanceExpr = sql<number>`(
      ${pointSummaries.directPoinAha}
      + ${pointSummaries.bintangCount} * ${bintangPointImpact}
      - ${pointSummaries.penaltiPointsSum} * ${penaltiPointImpact}
      - ${pointSummaries.redeemedTotal}
    )`.as('poin_aha_balance')

    const orderExpr =
      input.type === 'bintang'
        ? desc(pointSummaries.bintangCount)
        : input.type === 'penalti'
          ? desc(pointSummaries.penaltiPointsSum)
          : desc(poinAhaBalanceExpr)

    const offset = (input.page - 1) * input.limit

    // Run count and paginated query in parallel
    const [countResult, rows] = await Promise.all([
      db
        .select({ total: count() })
        .from(pointSummaries)
        .innerJoin(heroesProfiles, eq(pointSummaries.userId, heroesProfiles.id))
        .where(whereConditions),

      db
        .select({
          userId: pointSummaries.userId,
          name: heroesProfiles.name,
          avatarUrl: heroesProfiles.avatarUrl,
          teamId: heroesProfiles.teamKey,
          bintangCount: pointSummaries.bintangCount,
          penaltiPointsSum: pointSummaries.penaltiPointsSum,
          poinAhaBalance: poinAhaBalanceExpr,
        })
        .from(pointSummaries)
        .innerJoin(heroesProfiles, eq(pointSummaries.userId, heroesProfiles.id))
        .where(whereConditions)
        .orderBy(orderExpr)
        .limit(input.limit)
        .offset(offset),
    ])

    const total = Number(countResult[0]?.total ?? 0)

    const entries: LeaderboardEntry[] = rows.map((row, index) => ({
      rank: offset + index + 1,
      userId: row.userId,
      name: row.name,
      avatarUrl: row.avatarUrl,
      teamId: row.teamId,
      score:
        input.type === 'bintang'
          ? row.bintangCount
          : input.type === 'penalti'
            ? row.penaltiPointsSum
            : Number(row.poinAhaBalance ?? 0),
      bintangCount: row.bintangCount,
      penaltiCount: row.penaltiPointsSum,
    }))

    return {
      entries,
      meta: { total, page: input.page, limit: input.limit },
    }
  })
}

/**
 * Time-filtered leaderboard: aggregates directly from achievement_points
 * for a given date range instead of using pre-computed point_summaries.
 */
async function getLeaderboardFiltered(
  input: LeaderboardInput & { months: number },
  ctx: ServiceContext,
  bintangPointImpact: number,
  penaltiPointImpact: number,
): Promise<{ entries: LeaderboardEntry[]; meta: { total: number; page: number; limit: number } }> {
  return withRLS(ctx.actor, async (db) => {
    const sinceDate = sql`now() - make_interval(months => ${input.months}::int)`

    // NOTE: Do NOT use .as() aliases on expressions used in raw sql`` templates.
    // Drizzle renders SQL.Aliased as just the alias name (e.g. "bintang_count"),
    // not the full expression — causing "column does not exist" errors.
    // Instead, add aliases manually in the SELECT template string.

    const bintangCountExpr = sql`COALESCE(COUNT(*) FILTER (
      WHERE ${pointCategories.code} = 'BINTANG' AND ${achievementPoints.status} = 'active'
    ), 0)`

    const penaltiSumExpr = sql`COALESCE(SUM(${achievementPoints.points}) FILTER (
      WHERE ${pointCategories.code} = 'PENALTI' AND ${achievementPoints.status} IN ('active', 'challenged')
    ), 0)`

    const poinAhaBalanceExpr = sql`(
      COALESCE(SUM(${achievementPoints.points}) FILTER (
        WHERE ${pointCategories.code} = 'POIN_AHA' AND ${achievementPoints.status} = 'active'
      ), 0)
      + COALESCE(COUNT(*) FILTER (
        WHERE ${pointCategories.code} = 'BINTANG' AND ${achievementPoints.status} = 'active'
      ), 0) * ${bintangPointImpact}
      - COALESCE(SUM(${achievementPoints.points}) FILTER (
        WHERE ${pointCategories.code} = 'PENALTI' AND ${achievementPoints.status} IN ('active', 'challenged')
      ), 0) * ${penaltiPointImpact}
    )`

    // PostgreSQL allows ORDER BY output-column alias
    const orderExpr =
      input.type === 'bintang'
        ? sql`bintang_count DESC`
        : input.type === 'penalti'
          ? sql`penalti_sum DESC`
          : sql`poin_aha_balance DESC`

    const teamCondition = input.teamId ? sql`AND ${heroesProfiles.teamKey} = ${input.teamId}` : sql``

    const baseWhere = sql`
      ${heroesProfiles.isActive} = true
      AND ${heroesProfiles.branchKey} = ${ctx.actor.branchKey}
      ${teamCondition}
      AND ${achievementPoints.createdAt} >= ${sinceDate}
    `

    const offset = (input.page - 1) * input.limit

    // Count distinct users who have any points in the period
    let countRows: Array<{ total: string }>
    try {
      countRows = (await db.execute<{ total: string }>(sql`
        SELECT COUNT(DISTINCT ${heroesProfiles.id}) AS total
        FROM ${heroesProfiles}
        INNER JOIN ${achievementPoints} ON ${achievementPoints.userId} = ${heroesProfiles.id}
        INNER JOIN ${pointCategories} ON ${pointCategories.id} = ${achievementPoints.categoryId}
        WHERE ${baseWhere}
      `)) as unknown as Array<{ total: string }>
    } catch (err) {
      console.error('[leaderboard:filtered] COUNT query failed:', err)
      throw err
    }

    const total = Number(countRows[0]?.total ?? 0)

    type FilteredRow = {
      user_id: string
      name: string
      avatar_url: string | null
      team_id: string | null
      bintang_count: string
      penalti_sum: string
      poin_aha_balance: string
    }

    let dataRows: FilteredRow[]
    try {
      dataRows = (await db.execute<FilteredRow>(sql`
        SELECT
          ${heroesProfiles.id} AS user_id,
          ${heroesProfiles.name} AS name,
          ${heroesProfiles.avatarUrl} AS avatar_url,
          ${heroesProfiles.teamKey} AS team_id,
          ${bintangCountExpr} AS bintang_count,
          ${penaltiSumExpr} AS penalti_sum,
          ${poinAhaBalanceExpr} AS poin_aha_balance
        FROM ${heroesProfiles}
        INNER JOIN ${achievementPoints} ON ${achievementPoints.userId} = ${heroesProfiles.id}
        INNER JOIN ${pointCategories} ON ${pointCategories.id} = ${achievementPoints.categoryId}
        WHERE ${baseWhere}
        GROUP BY ${heroesProfiles.id}, ${heroesProfiles.name}, ${heroesProfiles.avatarUrl}, ${heroesProfiles.teamKey}
        ORDER BY ${orderExpr}
        LIMIT ${input.limit}
        OFFSET ${offset}
      `)) as unknown as FilteredRow[]
    } catch (err) {
      console.error('[leaderboard:filtered] SELECT query failed:', err)
      throw err
    }

    const entries: LeaderboardEntry[] = dataRows.map((row, index) => ({
      rank: offset + index + 1,
      userId: row.user_id,
      name: row.name,
      avatarUrl: row.avatar_url,
      teamId: row.team_id,
      score:
        input.type === 'bintang'
          ? Number(row.bintang_count)
          : input.type === 'penalti'
            ? Number(row.penalti_sum)
            : Number(row.poin_aha_balance ?? 0),
      bintangCount: Number(row.bintang_count),
      penaltiCount: Number(row.penalti_sum),
    }))

    return {
      entries,
      meta: { total, page: input.page, limit: input.limit },
    }
  })
}
