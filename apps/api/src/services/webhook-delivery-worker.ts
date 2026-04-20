/**
 * Webhook delivery worker — polls `webhook_delivery_jobs` and retries failed
 * first-attempt deliveries in a durable, multi-instance-safe way.
 *
 * Retry cadence (see webhook-dispatcher.ts for the full picture):
 *   attemptCount=1 (inserted by dispatcher on inline failure) → worker runs at T+30s
 *   attemptCount=2 (set by worker on its first failure)       → worker runs at T+2m30s
 *   attemptCount=3 (set by worker on second failure)          → MAX_RETRY_ATTEMPTS reached, endpoint disabled
 *
 * RETRY_DELAYS_MS is indexed by the CURRENT attemptCount after a failure:
 *   RETRY_DELAYS_MS[0] = 30_000  → delay before attempt 2 (inline failed at attempt 1)
 *   RETRY_DELAYS_MS[1] = 120_000 → delay before attempt 3 (worker attempt 2 failed)
 *   attemptCount=3               → MAX hit, disable, no further delay needed
 *
 * Concurrency safety: SKIP LOCKED ensures two worker instances never claim the
 * same job. Stale-lock reclaim handles jobs abandoned by a crashed worker.
 */

import { hostname } from 'node:os'
import { eq, sql } from 'drizzle-orm'
import { db as defaultDb } from '~/db'
import { webhookDeliveryJobs } from '~/db/schema/webhook-delivery-jobs'
import { appWebhookEndpoints } from '~/db/schema/app-webhook-endpoints'
import { deliverWebhook, MAX_RETRY_ATTEMPTS, RETRY_DELAYS_MS } from './webhook-dispatcher'
import type { PortalWebhookEvent } from '@coms-portal/shared'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal DB interface required by the worker — injected for testability. */
export type WorkerDb = typeof defaultDb

export interface WebhookDeliveryWorkerOptions {
  /** How often to poll for due jobs. Default: 30_000ms */
  pollIntervalMs?: number
  /** Max jobs to claim per tick. Default: 10 */
  batchSize?: number
  /** Reclaim jobs that have been 'running' longer than this. Default: 300_000ms (5 min) */
  staleLockTimeoutMs?: number
  /** Identifies this worker instance in the lockedBy column. */
  workerId?: string
  /** Override fetch for testing. */
  fetchImpl?: typeof fetch
  /** Override current time for testing. */
  now?: () => Date
  /** Override the DB connection for testing. */
  db?: WorkerDb
}

export interface WebhookDeliveryWorkerHandle {
  stop: () => Promise<void>
}

export function startWebhookDeliveryWorker(
  opts?: WebhookDeliveryWorkerOptions,
): WebhookDeliveryWorkerHandle {
  const pollIntervalMs = opts?.pollIntervalMs ?? 30_000
  const batchSize = opts?.batchSize ?? 10
  const staleLockTimeoutMs = opts?.staleLockTimeoutMs ?? 300_000
  const workerId =
    opts?.workerId ?? `${hostname()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  const fetchImpl = opts?.fetchImpl ?? fetch
  const now = opts?.now ?? (() => new Date())
  const db = opts?.db ?? defaultDb

  let running = true
  let tickPromise: Promise<void> = Promise.resolve()
  let timer: ReturnType<typeof setTimeout> | null = null

  function scheduleNext() {
    if (!running) return
    timer = setTimeout(() => {
      timer = null
      tickPromise = runTick().finally(() => {
        if (running) scheduleNext()
      })
    }, pollIntervalMs)
  }

  // Kick off the first tick immediately, then schedule subsequent ones.
  tickPromise = runTick().finally(() => {
    if (running) scheduleNext()
  })

  async function runTick(): Promise<void> {
    try {
      await tick({ batchSize, staleLockTimeoutMs, workerId, fetchImpl, now, db })
    } catch (err) {
      // Never let a broken tick kill the loop.
      console.error('[webhook-delivery-worker] Unhandled tick error:', err)
    }
  }

  return {
    stop: async () => {
      running = false
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      // Wait for any in-flight tick to finish before resolving.
      await tickPromise
    },
  }
}

// ---------------------------------------------------------------------------
// Core tick — exported for direct testing
// ---------------------------------------------------------------------------

export interface TickOptions {
  batchSize: number
  staleLockTimeoutMs: number
  workerId: string
  fetchImpl: typeof fetch
  now: () => Date
  db: WorkerDb
}

export async function tick(opts: TickOptions): Promise<void> {
  const { batchSize, staleLockTimeoutMs, workerId, fetchImpl, now, db } = opts
  const currentTime = now()

  // --- Step 1: Reclaim stale locks ------------------------------------------
  // Jobs stuck in 'running' state (worker crashed or was killed) are reset to
  // 'pending' so another worker can pick them up.
  await db.execute(
    sql`
      UPDATE webhook_delivery_jobs
      SET status = 'pending',
          locked_by = NULL,
          locked_at = NULL,
          updated_at = ${currentTime.toISOString()}
      WHERE status = 'running'
        AND locked_at < ${new Date(currentTime.getTime() - staleLockTimeoutMs).toISOString()}
    `,
  )

  // --- Step 2: Claim a batch of due jobs ------------------------------------
  // FOR UPDATE SKIP LOCKED: only Postgres raw SQL can express this; Drizzle's
  // query builder does not support SKIP LOCKED as of v0.45. We use db.execute()
  // with an UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING *
  // to atomically claim and return the rows in one round-trip.
  const claimResult = await db.execute<{
    id: string
    endpoint_id: string
    event: string
    event_id: string
    json_body: string
    occurred_at: Date
    attempt_count: number
    next_attempt_at: Date
    status: string
    last_error: string | null
    locked_by: string | null
    locked_at: Date | null
    created_at: Date
    updated_at: Date
  }>(
    sql`
      UPDATE webhook_delivery_jobs
      SET status = 'running',
          locked_by = ${workerId},
          locked_at = ${currentTime.toISOString()},
          updated_at = ${currentTime.toISOString()}
      WHERE id IN (
        SELECT id FROM webhook_delivery_jobs
        WHERE status = 'pending'
          AND next_attempt_at <= ${currentTime.toISOString()}
        ORDER BY next_attempt_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `,
  )

  // Drizzle's db.execute returns the rows directly as an array with postgres-js.
  const jobs = Array.isArray(claimResult)
    ? claimResult
    : ((claimResult as unknown as { rows: unknown[] }).rows ?? [])

  if (jobs.length === 0) return

  // --- Step 3: Process each job ---------------------------------------------
  await Promise.allSettled(jobs.map((job) => processJob(job as RawJob, { fetchImpl, now, db })))
}

// ---------------------------------------------------------------------------
// Internal: process a single claimed job
// ---------------------------------------------------------------------------

interface RawJob {
  id: string
  endpoint_id: string
  event: string
  event_id: string
  json_body: string
  occurred_at: Date
  attempt_count: number
  next_attempt_at: Date
  status: string
  last_error: string | null
  locked_by: string | null
  locked_at: Date | null
  created_at: Date
  updated_at: Date
}

async function processJob(
  job: RawJob,
  opts: { fetchImpl: typeof fetch; now: () => Date; db: WorkerDb },
): Promise<void> {
  const { fetchImpl, now, db } = opts
  const currentTime = now()

  // Load the endpoint — it may have been deleted (cascade removes the job, but
  // the job was already claimed) or disabled since the job was inserted.
  const [endpoint] = await db
    .select()
    .from(appWebhookEndpoints)
    .where(eq(appWebhookEndpoints.id, job.endpoint_id))

  if (!endpoint || endpoint.status !== 'active') {
    // Endpoint gone or disabled — mark completed with a note; do not retry.
    const reason = !endpoint
      ? 'Endpoint deleted; job abandoned'
      : `Endpoint disabled (status=${endpoint.status}); job abandoned`
    console.warn(`[webhook-delivery-worker] job ${job.id}: ${reason}`)
    await db
      .update(webhookDeliveryJobs)
      .set({ status: 'completed', lastError: reason, updatedAt: currentTime })
      .where(eq(webhookDeliveryJobs.id, job.id))
    return
  }

  // Attempt delivery using the stored body (signature is deterministic over the
  // stored jsonBody + occurredAt — do NOT regenerate jsonBody).
  const occurredAtIso =
    job.occurred_at instanceof Date
      ? job.occurred_at.toISOString()
      : String(job.occurred_at)

  try {
    await deliverWebhook(
      endpoint.url,
      endpoint.secret,
      job.event as PortalWebhookEvent,
      job.json_body,
      job.event_id,
      occurredAtIso,
      fetchImpl,
    )

    // Success
    await db
      .update(webhookDeliveryJobs)
      .set({ status: 'completed', lastError: null, updatedAt: currentTime })
      .where(eq(webhookDeliveryJobs.id, job.id))

    await db
      .update(appWebhookEndpoints)
      .set({ failureCount: 0, lastDeliveredAt: currentTime, updatedAt: currentTime })
      .where(eq(appWebhookEndpoints.id, job.endpoint_id))

    console.info(
      `[webhook-delivery-worker] job ${job.id} completed (attempt ${job.attempt_count + 1}/${MAX_RETRY_ATTEMPTS})`,
    )
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err)
    const newAttemptCount = job.attempt_count + 1

    if (newAttemptCount >= MAX_RETRY_ATTEMPTS) {
      // All attempts exhausted — disable the endpoint.
      console.error(
        `[webhook-delivery-worker] job ${job.id}: endpoint ${job.endpoint_id} (${endpoint.url}) disabled after ${MAX_RETRY_ATTEMPTS} total attempts. Last error: ${reason}`,
      )
      await db
        .update(webhookDeliveryJobs)
        .set({
          status: 'failed',
          attemptCount: newAttemptCount,
          lastError: reason.slice(0, 500),
          updatedAt: currentTime,
        })
        .where(eq(webhookDeliveryJobs.id, job.id))

      await db
        .update(appWebhookEndpoints)
        .set({
          status: 'disabled',
          failureCount: sql`${appWebhookEndpoints.failureCount} + 1`,
          lastFailureAt: currentTime,
          lastFailureReason: reason.slice(0, 500),
          updatedAt: currentTime,
        })
        .where(eq(appWebhookEndpoints.id, job.endpoint_id))
    } else {
      // Schedule next retry. RETRY_DELAYS_MS is indexed by attemptCount after
      // failure: job.attempt_count was 1 when this worker picked it up for
      // attempt 2; after failure newAttemptCount=2, and RETRY_DELAYS_MS[1]=120s
      // gives the delay before attempt 3.
      const delayMs =
        RETRY_DELAYS_MS[job.attempt_count] ??
        RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
      const nextAttemptAt = new Date(currentTime.getTime() + delayMs)

      console.warn(
        `[webhook-delivery-worker] job ${job.id} attempt ${newAttemptCount}/${MAX_RETRY_ATTEMPTS} failed, next retry at ${nextAttemptAt.toISOString()}. Reason: ${reason}`,
      )

      await db
        .update(webhookDeliveryJobs)
        .set({
          status: 'pending',
          attemptCount: newAttemptCount,
          nextAttemptAt,
          lastError: reason.slice(0, 500),
          lockedBy: null,
          lockedAt: null,
          updatedAt: currentTime,
        })
        .where(eq(webhookDeliveryJobs.id, job.id))

      await db
        .update(appWebhookEndpoints)
        .set({
          failureCount: sql`${appWebhookEndpoints.failureCount} + 1`,
          lastFailureAt: currentTime,
          lastFailureReason: reason.slice(0, 500),
          updatedAt: currentTime,
        })
        .where(eq(appWebhookEndpoints.id, job.endpoint_id))
    }
  }
}
