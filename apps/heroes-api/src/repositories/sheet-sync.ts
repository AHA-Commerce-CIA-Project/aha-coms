import { eq, desc, count } from 'drizzle-orm'
import { sheetSyncJobs } from '@coms/shared/db/schema'
import type { DbClient } from './base'
import { getDb } from './base'

export type SheetSyncJobRow = typeof sheetSyncJobs.$inferSelect

export async function createJob(
  data: typeof sheetSyncJobs.$inferInsert,
  tx?: DbClient,
) {
  const db = getDb(tx)
  const [created] = await db.insert(sheetSyncJobs).values(data).returning()
  return created
}

export async function updateJob(
  id: string,
  data: Partial<typeof sheetSyncJobs.$inferInsert>,
  tx?: DbClient,
) {
  const db = getDb(tx)
  const [updated] = await db
    .update(sheetSyncJobs)
    .set(data)
    .where(eq(sheetSyncJobs.id, id))
    .returning()
  return updated ?? null
}

export async function getLatestJob(tx?: DbClient) {
  const db = getDb(tx)
  const [job] = await db
    .select()
    .from(sheetSyncJobs)
    .orderBy(desc(sheetSyncJobs.createdAt))
    .limit(1)
  return job ?? null
}

export async function listJobs(
  opts: { page: number; limit: number },
  tx?: DbClient,
) {
  const db = getDb(tx)
  const offset = (opts.page - 1) * opts.limit
  const [jobs, [{ total }]] = await Promise.all([
    db
      .select()
      .from(sheetSyncJobs)
      .orderBy(desc(sheetSyncJobs.createdAt))
      .limit(opts.limit)
      .offset(offset),
    db.select({ total: count() }).from(sheetSyncJobs),
  ])
  return {
    jobs,
    meta: {
      total,
      page: opts.page,
      limit: opts.limit,
      totalPages: Math.ceil(total / opts.limit),
    },
  }
}

export async function getJobById(id: string, tx?: DbClient) {
  const db = getDb(tx)
  const [job] = await db
    .select()
    .from(sheetSyncJobs)
    .where(eq(sheetSyncJobs.id, id))
    .limit(1)
  return job ?? null
}
