import { eq, and, gte, lte, sql } from 'drizzle-orm'
import { achievementPoints, pointCategories, heroesProfiles } from '@coms-portal/heroes-shared/db/schema'
import { withRLS } from '../repositories/base'
import type { AuthUser } from '../middleware/auth'
import type { ReportsQueryInput } from '@coms-portal/heroes-shared/schemas'

type ServiceContext = {
  readonly actor: AuthUser
}

export type DashboardStats = {
  totalSubmissions: number
  byCategory: { name: string; count: number }[]
  byTeam: { name: string; total: number }[]
  overTime: { date: string; count: number }[]
}

export async function getDashboardStats(
  input: ReportsQueryInput,
  ctx: ServiceContext,
): Promise<DashboardStats> {
  if (ctx.actor.role !== 'admin' && ctx.actor.role !== 'hr') {
    throw new InsufficientRoleError()
  }

  return withRLS(ctx.actor, async (db) => {
    const branchKey =
      ctx.actor.role === 'admin' || ctx.actor.role === 'hr' ? (input.branchKey ?? null) : ctx.actor.branchKey

    const baseConditions = []
    if (branchKey !== null) {
      baseConditions.push(
        sql`${achievementPoints.userId} IN (SELECT id FROM heroes_profiles WHERE branch_key = ${branchKey})`,
      )
    }
    if (input.startDate) {
      baseConditions.push(gte(achievementPoints.createdAt, new Date(input.startDate)))
    }
    if (input.endDate) {
      baseConditions.push(lte(achievementPoints.createdAt, new Date(input.endDate)))
    }

    const baseWhere = baseConditions.length > 0 ? and(...baseConditions) : undefined

    const [totalResult, categoryRows, teamRows, overTimeRows] = await Promise.all([
      db.select({ total: sql<number>`count(*)::int` }).from(achievementPoints).where(baseWhere),

      db
        .select({ name: pointCategories.defaultName, count: sql<number>`count(*)::int` })
        .from(achievementPoints)
        .innerJoin(pointCategories, eq(achievementPoints.categoryId, pointCategories.id))
        .where(baseWhere)
        .groupBy(pointCategories.id, pointCategories.defaultName)
        .orderBy(pointCategories.defaultName),

      db
        .select({ name: heroesProfiles.teamValueSnapshot, total: sql<number>`sum(${achievementPoints.points})::int` })
        .from(achievementPoints)
        .innerJoin(heroesProfiles, eq(achievementPoints.userId, heroesProfiles.id))
        .where(baseWhere)
        .groupBy(heroesProfiles.teamValueSnapshot)
        .orderBy(heroesProfiles.teamValueSnapshot),

      db
        .select({
          date: sql<string>`DATE(${achievementPoints.createdAt})`.as('date'),
          count: sql<number>`count(*)::int`,
        })
        .from(achievementPoints)
        .where(baseWhere)
        .groupBy(sql`DATE(${achievementPoints.createdAt})`)
        .orderBy(sql`DATE(${achievementPoints.createdAt})`),
    ])

    const total = totalResult[0]?.total ?? 0

    return {
      totalSubmissions: Number(total ?? 0),
      byCategory: categoryRows.map((r) => ({ name: r.name, count: Number(r.count) })),
      byTeam: teamRows.map((r) => ({ name: r.name ?? '', total: Number(r.total ?? 0) })),
      overTime: overTimeRows.map((r) => ({
        date: String(r.date),
        count: Number(r.count),
      })),
    }
  })
}

export class InsufficientRoleError extends Error {
  constructor() {
    super('Insufficient role for this action')
    this.name = 'InsufficientRoleError'
  }
}
