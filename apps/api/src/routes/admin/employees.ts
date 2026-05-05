import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { db } from '~/db'
import { identityUsers } from '~/db/schema'
import { requireRole } from '~/middleware/rbac'
import { emitUserProvisioned } from '~/services/provisioning-events'
import { logAudit } from '~/services/audit'
import { logger } from '~/logger'

const REBROADCAST_CONCURRENCY = 5

async function fanOutWithConcurrency(
  ids: string[],
  worker: (id: string) => Promise<void>,
): Promise<{ fired: number; failures: Array<{ userId: string; error: string }> }> {
  let fired = 0
  const failures: Array<{ userId: string; error: string }> = []
  let cursor = 0

  async function next(): Promise<void> {
    while (cursor < ids.length) {
      const id = ids[cursor++]
      try {
        await worker(id)
        fired++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        failures.push({ userId: id, error: message })
      }
    }
  }

  const lanes = Math.min(REBROADCAST_CONCURRENCY, Math.max(1, ids.length))
  await Promise.all(Array.from({ length: lanes }, () => next()))

  return { fired, failures }
}

export const adminEmployeesRoutes = new Elysia({ prefix: '/employees' })
  .use(requireRole('admin'))

  // POST /api/v1/admin/employees/rebroadcast-provisioning
  //
  // Re-fires `user.provisioned` webhooks for the supplied users (or every
  // active identity_users row when no `userIds` filter is given).  Built for
  // the Spec 07/08 cutover window: portal pre-existing users had their
  // initial `user.provisioned` events fired long before Heroes Deploy A,
  // so a fresh Heroes (post-truncate) needs a way to rebuild
  // `heroes_profiles` from portal source-of-truth without touching
  // identity_users.
  //
  // Idempotency: each `emitUserProvisioned` call constructs a fresh
  // `eventId` per dispatch; Heroes' webhook handler dedupes on `eventId`,
  // so re-running this endpoint repeatedly is safe.
  .post(
    '/rebroadcast-provisioning',
    async ({ body, authUser, requestId, actorIp }) => {
      const requestedIds = body?.userIds ?? null
      const requestedCount = requestedIds?.length ?? null

      let targetIds: string[]
      if (requestedIds && requestedIds.length > 0) {
        targetIds = requestedIds
      } else {
        const rows = await db
          .select({ id: identityUsers.id })
          .from(identityUsers)
          .where(eq(identityUsers.status, 'active'))
        targetIds = rows.map((r) => r.id)
      }

      const { fired, failures } = await fanOutWithConcurrency(targetIds, async (userId) => {
        await emitUserProvisioned(userId)
      })

      const batchId = randomUUID()

      await logAudit({
        actorId: authUser.id,
        action: 'bulk_rebroadcast_provisioning',
        targetType: 'user',
        targetId: authUser.id,
        details: {
          batchId,
          count: targetIds.length,
          requestedCount,
          fired,
          failed: failures.length,
          source: 'admin-cli',
        },
        requestId,
        actorIp,
      })

      for (const failure of failures) {
        await logAudit({
          actorId: authUser.id,
          action: 'bulk_rebroadcast_provisioning_failure',
          targetType: 'user',
          targetId: failure.userId,
          details: { batchId, error: failure.error },
          requestId,
          actorIp,
        })
        logger.warn(
          { batchId, userId: failure.userId, error: failure.error },
          '[admin/employees] rebroadcast-provisioning emit failed for user',
        )
      }

      return {
        ok: true,
        batchId,
        count: targetIds.length,
        fired,
        failed: failures.length,
        failures,
      }
    },
    {
      body: t.Optional(
        t.Object({
          userIds: t.Optional(t.Array(t.String({ format: 'uuid' }))),
        }),
      ),
    },
  )
