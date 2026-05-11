import { eq } from 'drizzle-orm'
import { systemSettings } from '@coms/shared/db/schema'
import type { DbClient } from './base'
import { getDb } from './base'

export type SettingRow = typeof systemSettings.$inferSelect

export async function getAllSettings(tx?: DbClient): Promise<SettingRow[]> {
  const db = getDb(tx)
  return db.select().from(systemSettings).orderBy(systemSettings.key)
}

export async function getSettingByKey(
  key: string,
  tx?: DbClient,
): Promise<SettingRow | null> {
  const db = getDb(tx)
  const [row] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1)
  return row ?? null
}

export async function upsertSetting(
  key: string,
  value: unknown,
  updatedBy: string,
  tx?: DbClient,
): Promise<SettingRow> {
  const db = getDb(tx)
  const now = new Date()
  const [row] = await db
    .insert(systemSettings)
    .values({ key, value, updatedBy, updatedAt: now })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, updatedBy, updatedAt: now },
    })
    .returning()
  return row
}
