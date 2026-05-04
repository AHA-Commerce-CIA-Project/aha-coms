import { eq, and, count, desc, sql, ilike, gte, lte } from 'drizzle-orm'
import { redemptions, rewards, heroesProfiles, emailCache } from '@coms/shared/db/schema'
import type { DbClient } from './base'
import { getDb } from './base'

export type RedemptionRow = typeof redemptions.$inferSelect

type ListFilters = {
  readonly status?: string
  readonly userId?: string
  readonly search?: string
  readonly dateFrom?: string
  readonly dateTo?: string
}

type ListOpts = {
  readonly page: number
  readonly limit: number
}

export async function listRedemptions(
  opts: ListOpts,
  filters: ListFilters,
  tx?: DbClient,
) {
  const db = getDb(tx)
  const offset = (opts.page - 1) * opts.limit

  const conditions = []
  if (filters.status) {
    conditions.push(sql`${redemptions.status} = ${filters.status}`)
  }
  if (filters.userId) {
    conditions.push(eq(redemptions.userId, filters.userId))
  }
  if (filters.search) {
    conditions.push(ilike(rewards.name, `%${filters.search}%`))
  }
  if (filters.dateFrom) {
    conditions.push(gte(redemptions.createdAt, new Date(filters.dateFrom)))
  }
  if (filters.dateTo) {
    conditions.push(lte(redemptions.createdAt, new Date(`${filters.dateTo}T23:59:59.999Z`)))
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: redemptions.id,
        branchId: redemptions.branchId,
        userId: redemptions.userId,
        rewardId: redemptions.rewardId,
        pointsSpent: redemptions.pointsSpent,
        notes: redemptions.notes,
        status: redemptions.status,
        approvedBy: redemptions.approvedBy,
        approvedAt: redemptions.approvedAt,
        rejectionReason: redemptions.rejectionReason,
        createdAt: redemptions.createdAt,
        updatedAt: redemptions.updatedAt,
        rewardName: rewards.name,
        rewardPointCost: rewards.pointCost,
        userName: heroesProfiles.name,
        userEmail: emailCache.contactEmail,
      })
      .from(redemptions)
      .innerJoin(rewards, eq(redemptions.rewardId, rewards.id))
      .innerJoin(heroesProfiles, eq(redemptions.userId, heroesProfiles.id))
      .leftJoin(emailCache, eq(redemptions.userId, emailCache.portalSub))
      .where(where)
      .orderBy(desc(redemptions.createdAt))
      .limit(opts.limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(redemptions)
      .innerJoin(rewards, eq(redemptions.rewardId, rewards.id))
      .where(where),
  ])

  return { rows, total }
}

export async function getRedemptionById(id: string, tx?: DbClient) {
  const db = getDb(tx)
  const [result] = await db
    .select({
      id: redemptions.id,
      branchId: redemptions.branchId,
      userId: redemptions.userId,
      rewardId: redemptions.rewardId,
      pointsSpent: redemptions.pointsSpent,
      notes: redemptions.notes,
      status: redemptions.status,
      approvedBy: redemptions.approvedBy,
      approvedAt: redemptions.approvedAt,
      rejectionReason: redemptions.rejectionReason,
      createdAt: redemptions.createdAt,
      updatedAt: redemptions.updatedAt,
      rewardName: rewards.name,
      rewardPointCost: rewards.pointCost,
      rewardDescription: rewards.description,
      userName: heroesProfiles.name,
      userEmail: emailCache.contactEmail,
    })
    .from(redemptions)
    .innerJoin(rewards, eq(redemptions.rewardId, rewards.id))
    .innerJoin(heroesProfiles, eq(redemptions.userId, heroesProfiles.id))
    .leftJoin(emailCache, eq(redemptions.userId, emailCache.portalSub))
    .where(eq(redemptions.id, id))
    .limit(1)
  return result ?? null
}

export async function createRedemption(
  data: typeof redemptions.$inferInsert,
  tx?: DbClient,
) {
  const db = getDb(tx)
  const [created] = await db.insert(redemptions).values(data).returning()
  return created
}

export async function updateRedemptionStatus(
  id: string,
  data: {
    status: 'pending' | 'approved' | 'rejected'
    approvedBy?: string
    approvedAt?: Date
    rejectionReason?: string
  },
  tx?: DbClient,
) {
  const db = getDb(tx)
  const [updated] = await db
    .update(redemptions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(redemptions.id, id))
    .returning()
  return updated ?? null
}
