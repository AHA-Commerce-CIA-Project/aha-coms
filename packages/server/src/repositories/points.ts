import { eq, and, count, desc, ilike, gte, lte } from 'drizzle-orm'
import { achievementPoints, pointCategories, heroesProfiles, emailCache } from '@coms/shared/db/schema'
import type { DbClient } from './base'
import { getDb } from './base'
import type { PointStatus, PointCategoryCode } from '@coms/shared/constants'

export type PointRow = typeof achievementPoints.$inferSelect

type ListPointsOpts = {
  readonly page: number
  readonly limit: number
  readonly categoryCode?: PointCategoryCode
  readonly status?: PointStatus
  readonly userId?: string
  readonly teamId?: string
  readonly search?: string
  readonly submittedBy?: string
  readonly dateFrom?: string
  readonly dateTo?: string
}

export async function listPoints(opts: ListPointsOpts, tx?: DbClient) {
  const db = getDb(tx)
  const conditions = []

  if (opts.status) conditions.push(eq(achievementPoints.status, opts.status))
  if (opts.userId) conditions.push(eq(achievementPoints.userId, opts.userId))
  if (opts.search) conditions.push(ilike(achievementPoints.reason, `%${opts.search}%`))
  if (opts.submittedBy) conditions.push(eq(achievementPoints.submittedBy, opts.submittedBy))
  if (opts.dateFrom) conditions.push(gte(achievementPoints.createdAt, new Date(opts.dateFrom)))
  if (opts.dateTo) conditions.push(lte(achievementPoints.createdAt, new Date(`${opts.dateTo}T23:59:59.999Z`)))

  if (opts.categoryCode) {
    // Join to point_categories to filter by code
    const [cat] = await db
      .select({ id: pointCategories.id })
      .from(pointCategories)
      .where(eq(pointCategories.code, opts.categoryCode))
      .limit(1)
    if (cat) conditions.push(eq(achievementPoints.categoryId, cat.id))
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined
  const offset = (opts.page - 1) * opts.limit

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: achievementPoints.id,
        userId: achievementPoints.userId,
        categoryId: achievementPoints.categoryId,
        points: achievementPoints.points,
        reason: achievementPoints.reason,
        relatedStaff: achievementPoints.relatedStaff,
        screenshotUrl: achievementPoints.screenshotUrl,
        kittaComponent: achievementPoints.kittaComponent,
        status: achievementPoints.status,
        submittedBy: achievementPoints.submittedBy,
        createdAt: achievementPoints.createdAt,
        categoryCode: pointCategories.code,
        categoryName: pointCategories.defaultName,
        userName: heroesProfiles.name,
        userEmail: emailCache.contactEmail,
      })
      .from(achievementPoints)
      .innerJoin(pointCategories, eq(achievementPoints.categoryId, pointCategories.id))
      .innerJoin(heroesProfiles, eq(achievementPoints.userId, heroesProfiles.id))
      .leftJoin(emailCache, eq(achievementPoints.userId, emailCache.portalSub))
      .where(where)
      .orderBy(desc(achievementPoints.createdAt))
      .limit(opts.limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(achievementPoints)
      .where(where),
  ])

  return { rows, total }
}

export async function getPointById(id: string, tx?: DbClient) {
  const db = getDb(tx)
  const [point] = await db
    .select()
    .from(achievementPoints)
    .where(eq(achievementPoints.id, id))
    .limit(1)
  return point ?? null
}

export async function getPointWithDetails(id: string, tx?: DbClient) {
  const db = getDb(tx)
  const [result] = await db
    .select({
      point: achievementPoints,
      category: pointCategories,
      user: { id: heroesProfiles.id, name: heroesProfiles.name, email: emailCache.contactEmail, teamKey: heroesProfiles.teamKey },
    })
    .from(achievementPoints)
    .innerJoin(pointCategories, eq(achievementPoints.categoryId, pointCategories.id))
    .innerJoin(heroesProfiles, eq(achievementPoints.userId, heroesProfiles.id))
    .leftJoin(emailCache, eq(achievementPoints.userId, emailCache.portalSub))
    .where(eq(achievementPoints.id, id))
    .limit(1)
  return result ?? null
}

export async function createPoint(
  data: typeof achievementPoints.$inferInsert,
  tx?: DbClient,
) {
  const db = getDb(tx)
  const [created] = await db.insert(achievementPoints).values(data).returning()
  return created
}

export async function updatePointStatus(
  id: string,
  data: Partial<typeof achievementPoints.$inferInsert>,
  tx?: DbClient,
) {
  const db = getDb(tx)
  const [updated] = await db
    .update(achievementPoints)
    .set(data)
    .where(eq(achievementPoints.id, id))
    .returning()
  return updated ?? null
}
