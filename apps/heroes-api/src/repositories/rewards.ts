import { eq, asc, count } from 'drizzle-orm'
import { rewards } from '@coms/shared/db/schema'
import type { DbClient } from './base'
import { getDb } from './base'

export type RewardRow = typeof rewards.$inferSelect

type ListRewardsOpts = {
  readonly page: number
  readonly limit: number
}

export async function listRewards(opts: ListRewardsOpts, tx?: DbClient) {
  const db = getDb(tx)
  const offset = (opts.page - 1) * opts.limit

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(rewards)
      .orderBy(asc(rewards.name))
      .limit(opts.limit)
      .offset(offset),
    db.select({ total: count() }).from(rewards),
  ])

  return { rows, total }
}

export async function getRewardById(id: string, tx?: DbClient) {
  const db = getDb(tx)
  const [reward] = await db
    .select()
    .from(rewards)
    .where(eq(rewards.id, id))
    .limit(1)
  return reward ?? null
}

export async function createReward(
  data: typeof rewards.$inferInsert,
  tx?: DbClient,
) {
  const db = getDb(tx)
  const [created] = await db.insert(rewards).values(data).returning()
  return created
}

export async function updateReward(
  id: string,
  data: Partial<typeof rewards.$inferInsert>,
  tx?: DbClient,
) {
  const db = getDb(tx)
  const [updated] = await db
    .update(rewards)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(rewards.id, id))
    .returning()
  return updated ?? null
}
