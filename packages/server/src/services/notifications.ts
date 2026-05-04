import { notifications } from '@coms/shared/db/schema'
import type { DbClient } from '../repositories/base'
import { getDb } from '../repositories/base'

type CreateNotification = {
  readonly branchId?: string | null
  readonly userId: string
  readonly type: string
  readonly title: string
  readonly body?: string
  readonly entityType?: string
  readonly entityId?: string
}

export async function createNotification(
  data: CreateNotification,
  tx?: DbClient,
) {
  const db = getDb(tx)
  const [created] = await db
    .insert(notifications)
    .values({
      branchId: data.branchId,
      userId: data.userId,
      type: data.type,
      title: data.title,
      body: data.body ?? null,
      entityType: data.entityType ?? null,
      entityId: data.entityId ?? null,
    })
    .returning()
  return created
}
