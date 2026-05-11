import { eq } from 'drizzle-orm'
import { pointCategories, pointCategoryTranslations } from '@coms/shared/db/schema'
import type { DbClient } from './base'
import { getDb } from './base'

export type CategoryRow = typeof pointCategories.$inferSelect
export type CategoryTranslationRow = typeof pointCategoryTranslations.$inferSelect

export async function listCategories(tx?: DbClient) {
  const db = getDb(tx)

  const categories = await db
    .select()
    .from(pointCategories)
    .orderBy(pointCategories.code)

  const translations = await db
    .select()
    .from(pointCategoryTranslations)

  return categories.map((cat) => ({
    ...cat,
    translations: translations.filter((t) => t.categoryId === cat.id),
  }))
}

export async function getCategoryById(id: string, tx?: DbClient) {
  const db = getDb(tx)
  const [cat] = await db
    .select()
    .from(pointCategories)
    .where(eq(pointCategories.id, id))
    .limit(1)
  return cat ?? null
}

export async function toggleCategoryActive(
  id: string,
  isActive: boolean,
  tx?: DbClient,
) {
  const db = getDb(tx)
  const [updated] = await db
    .update(pointCategories)
    .set({ isActive })
    .where(eq(pointCategories.id, id))
    .returning()
  return updated ?? null
}
