import { db } from '~/db'
import { appRegistry } from '~/db/schema'
import { eq } from 'drizzle-orm'
import type { NewAppRegistry } from '~/db/schema'

export async function registerApp(
  data: Omit<NewAppRegistry, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<{ id: string }> {
  const [app] = await db.insert(appRegistry).values(data).returning({ id: appRegistry.id })
  return { id: app.id }
}

export async function updateApp(
  appId: string,
  data: Partial<Omit<NewAppRegistry, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  await db
    .update(appRegistry)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(appRegistry.id, appId))
}

export async function deregisterApp(appId: string): Promise<void> {
  await db
    .update(appRegistry)
    .set({ status: 'deprecated', updatedAt: new Date() })
    .where(eq(appRegistry.id, appId))
}
