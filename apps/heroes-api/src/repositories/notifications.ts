import { eq, and, count, desc, sql } from 'drizzle-orm'
import { notifications } from '@coms/shared/db/schema'
import type { DbClient } from './base'
import { getDb } from './base'

export type NotificationRow = typeof notifications.$inferSelect

type ListNotificationsOpts = {
  readonly userId: string
  readonly page: number
  readonly limit: number
  readonly unread?: boolean
}

export async function listNotifications(opts: ListNotificationsOpts, tx?: DbClient) {
  const db = getDb(tx)
  const conditions = [eq(notifications.userId, opts.userId)]

  if (opts.unread === true) {
    conditions.push(eq(notifications.isRead, false))
  } else if (opts.unread === false) {
    conditions.push(eq(notifications.isRead, true))
  }

  const where = and(...conditions)
  const offset = (opts.page - 1) * opts.limit

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(opts.limit)
      .offset(offset),
    db.select({ total: count() }).from(notifications).where(where),
  ])

  return { rows, total }
}

export async function countUnread(userId: string, tx?: DbClient) {
  const db = getDb(tx)
  const [{ total }] = await db
    .select({ total: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
  return total
}

export async function markRead(id: string, userId: string, tx?: DbClient) {
  const db = getDb(tx)
  const [updated] = await db
    .update(notifications)
    .set({ isRead: true, readAt: sql`now()` })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning()
  return updated ?? null
}

export async function markAllRead(userId: string, tx?: DbClient) {
  const db = getDb(tx)
  const result = await db
    .update(notifications)
    .set({ isRead: true, readAt: sql`now()` })
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
    .returning({ id: notifications.id })
  return result.length
}
