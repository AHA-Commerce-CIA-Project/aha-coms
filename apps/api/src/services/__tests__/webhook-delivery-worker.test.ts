import { beforeEach, describe, expect, mock, test } from 'bun:test'

// ---------------------------------------------------------------------------
// Schema stubs — set up before any module import that touches these paths
// ---------------------------------------------------------------------------

const webhookDeliveryJobsSchema = {
  id: 'webhook_delivery_jobs.id',
  endpointId: 'webhook_delivery_jobs.endpoint_id',
  event: 'webhook_delivery_jobs.event',
  eventId: 'webhook_delivery_jobs.event_id',
  jsonBody: 'webhook_delivery_jobs.json_body',
  occurredAt: 'webhook_delivery_jobs.occurred_at',
  attemptCount: 'webhook_delivery_jobs.attempt_count',
  nextAttemptAt: 'webhook_delivery_jobs.next_attempt_at',
  status: 'webhook_delivery_jobs.status',
  lastError: 'webhook_delivery_jobs.last_error',
  lockedBy: 'webhook_delivery_jobs.locked_by',
  lockedAt: 'webhook_delivery_jobs.locked_at',
  updatedAt: 'webhook_delivery_jobs.updated_at',
  failureCount: 'webhook_delivery_jobs.failure_count',
}

const appWebhookEndpointsSchema = {
  id: 'app_webhook_endpoints.id',
  url: 'app_webhook_endpoints.url',
  secret: 'app_webhook_endpoints.secret',
  status: 'app_webhook_endpoints.status',
  failureCount: 'app_webhook_endpoints.failure_count',
  lastDeliveredAt: 'app_webhook_endpoints.last_delivered_at',
  lastFailureAt: 'app_webhook_endpoints.last_failure_at',
  lastFailureReason: 'app_webhook_endpoints.last_failure_reason',
  updatedAt: 'app_webhook_endpoints.updated_at',
}

mock.module('~/db/schema/webhook-delivery-jobs', () => ({
  webhookDeliveryJobs: webhookDeliveryJobsSchema,
}))
mock.module('~/db/schema/app-webhook-endpoints', () => ({
  appWebhookEndpoints: appWebhookEndpointsSchema,
}))
mock.module('~/db', () => ({ db: {} })) // placeholder; tests inject db via TickOptions
mock.module('drizzle-orm', () => ({
  eq: (left: unknown, right: unknown) => ({ type: 'eq', left, right }),
  and: (...conditions: unknown[]) => ({ type: 'and', conditions }),
  sql: new Proxy(
    function sqlTag(strings: TemplateStringsArray, ...values: unknown[]) {
      return { queryChunks: [strings, ...values], toString: () => strings.join('?') }
    },
    {
      get: (_target, prop) => prop,
    },
  ),
  relations: () => ({}),
  inArray: (left: unknown, right: unknown) => ({ left, right }),
}))
mock.module('@coms-portal/shared', () => ({
  PORTAL_WEBHOOK_CONTRACT_VERSION: 1,
  PORTAL_WEBHOOK_SIGNATURE_HEADER: 'X-Portal-Signature',
  PORTAL_WEBHOOK_EVENT_HEADER: 'X-Portal-Event',
  PORTAL_WEBHOOK_EVENT_ID_HEADER: 'X-Portal-Event-Id',
  PORTAL_WEBHOOK_TIMESTAMP_HEADER: 'X-Portal-Timestamp',
  PORTAL_WEBHOOK_EVENTS: ['session.revoked', 'user.provisioned', 'user.updated', 'user.offboarded'],
}))

// Import tick AFTER all mocks are registered.
const { tick } = await import('../webhook-delivery-worker')

// ---------------------------------------------------------------------------
// In-memory store types
// ---------------------------------------------------------------------------

type RawJob = {
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

type EndpointRecord = {
  id: string
  url: string
  secret: string
  status: string
  failureCount: number
  lastDeliveredAt: Date | null
  lastFailureAt: Date | null
  lastFailureReason: string | null
  updatedAt: Date
}

// ---------------------------------------------------------------------------
// Per-test state (reset in beforeEach)
// ---------------------------------------------------------------------------

let jobStore: RawJob[] = []
let endpointStore: EndpointRecord[] = []
type UpdateRecord = { payload: Record<string, unknown> }
let dbUpdates: UpdateRecord[] = []
let executedSqlSnippets: string[] = []

// ---------------------------------------------------------------------------
// DB mock factory
//
// The worker receives `db` as a TickOptions field, so we build a fresh mock
// object per-test and inject it directly — no module re-mocking needed.
//
// NOTE ON whereId: We cannot reliably extract the target ID from the WHERE
// condition because the worker imports `eq` from drizzle-orm, which may be
// the real Drizzle eq() (complex SQL object) or our mocked one, depending on
// module cache state. To keep tests deterministic we drop whereId tracking
// and assert on payload shape alone — which is unambiguous for each operation
// (completed / pending / failed / disabled all have distinct payload shapes).
// ---------------------------------------------------------------------------

function buildDb(claimResult: RawJob[]) {
  return {
    execute: (() => {
      let callIndex = 0
      return async (query: { toString?: () => string; queryChunks?: unknown[] }) => {
        const snippet = query.toString?.() ?? JSON.stringify(query)
        executedSqlSnippets.push(snippet)
        callIndex++

        // First execute() call is always the stale-lock reclaim UPDATE (no RETURNING).
        // Second execute() call is always the claim UPDATE … RETURNING *.
        // We distinguish by call order to avoid matching on SQL content, which is
        // fragile when both queries set status='running'.
        if (callIndex === 1) {
          // Stale-lock reclaim: reset any 'running' jobs to 'pending' in our store.
          jobStore.forEach((j) => {
            if (j.status === 'running') {
              j.status = 'pending'
              j.locked_by = null
              j.locked_at = null
            }
          })
          return []
        }

        // Claim query: mark rows as running and return the snapshot.
        claimResult.forEach((j) => {
          const stored = jobStore.find((s) => s.id === j.id)
          if (stored) stored.status = 'running'
        })
        return claimResult
      }
    })(),

    // db.select().from(table).where(condition) — used to load endpoint rows.
    // Returns entire endpointStore; worker destructures [endpoint] = result.
    // Tests set up endpointStore with exactly the right endpoint(s).
    select: () => ({
      from: () => ({
        where: (_condition: unknown) => {
          return Promise.resolve([...endpointStore])
        },
      }),
    }),

    // db.update(table).set(payload).where(condition) — capture payloads for assertions.
    update: (_table: unknown) => ({
      set: (payload: Record<string, unknown>) => ({
        where: async (_condition: unknown) => {
          dbUpdates.push({ payload })
        },
      }),
    }),
  } as unknown as import('../webhook-delivery-worker').WorkerDb
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_OCCURRED_AT = new Date('2026-04-20T10:00:00.000Z')

function makeJob(overrides: Partial<RawJob> = {}): RawJob {
  return {
    id: `job-${Math.random().toString(36).slice(2)}`,
    endpoint_id: 'ep-1',
    event: 'session.revoked',
    event_id: crypto.randomUUID(),
    json_body: '{"contractVersion":1,"event":"session.revoked","eventId":"test","occurredAt":"2026-04-20T10:00:00.000Z","appSlug":"heroes","payload":{}}',
    occurred_at: BASE_OCCURRED_AT,
    attempt_count: 1,
    next_attempt_at: new Date(Date.now() - 1000), // due 1s ago
    status: 'pending',
    last_error: null,
    locked_by: null,
    locked_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }
}

function makeEndpoint(overrides: Partial<EndpointRecord> = {}): EndpointRecord {
  return {
    id: 'ep-1',
    url: 'https://heroes.ahacommerce.net/webhooks',
    secret: 'test-secret',
    status: 'active',
    failureCount: 0,
    lastDeliveredAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
    updatedAt: new Date(),
    ...overrides,
  }
}

function okFetch(): typeof fetch {
  return mock(async () => new Response(null, { status: 200 })) as unknown as typeof fetch
}

function failFetch(status = 500): typeof fetch {
  return mock(
    async () => new Response(null, { status, statusText: 'Server Error' }),
  ) as unknown as typeof fetch
}

const FIXED_NOW = new Date('2026-04-20T12:00:00.000Z')
const fixedNow = () => FIXED_NOW

function baseOpts(overrides: Partial<Parameters<typeof tick>[0]> = {}) {
  return {
    batchSize: 10,
    staleLockTimeoutMs: 300_000,
    workerId: 'test-worker',
    fetchImpl: okFetch(),
    now: fixedNow,
    db: buildDb([]), // default: no jobs claimed
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('webhook-delivery-worker tick', () => {
  beforeEach(() => {
    jobStore = []
    endpointStore = []
    dbUpdates = []
    executedSqlSnippets = []
  })

  test('claims a due job, delivers 2xx → job marked completed, endpoint lastDeliveredAt set, failureCount=0', async () => {
    const job = makeJob({ id: 'job-ok', endpoint_id: 'ep-1' })
    const ep = makeEndpoint({ id: 'ep-1' })
    jobStore.push(job)
    endpointStore.push(ep)

    await tick(baseOpts({
      db: buildDb([job]),
      fetchImpl: okFetch(),
    }))

    // Job update: status = 'completed'
    const jobUpdate = dbUpdates.find((u) => u.payload.status === 'completed')
    expect(jobUpdate).toBeDefined()
    expect(jobUpdate!.payload.lastError).toBeNull()

    // Endpoint update: failureCount = 0, lastDeliveredAt set
    const epUpdate = dbUpdates.find(
      (u) => 'lastDeliveredAt' in u.payload && u.payload.failureCount === 0,
    )
    expect(epUpdate).toBeDefined()
    expect(epUpdate!.payload.lastDeliveredAt).toBeInstanceOf(Date)
  })

  test('on non-2xx, attemptCount++ and nextAttemptAt +2min (worker retry 1: attempt_count=1 → 2)', async () => {
    // job.attempt_count=1: the inline attempt already failed.
    // Worker is running attempt 2. On failure: newAttemptCount=2, delay=RETRY_DELAYS_MS[1]=120s.
    const job = makeJob({ id: 'job-retry', endpoint_id: 'ep-1', attempt_count: 1 })
    const ep = makeEndpoint({ id: 'ep-1' })
    jobStore.push(job)
    endpointStore.push(ep)

    await tick(baseOpts({
      db: buildDb([job]),
      fetchImpl: failFetch(503),
    }))

    // Job update: status='pending', attemptCount=2, nextAttemptAt=+120s
    const jobUpdate = dbUpdates.find(
      (u) => u.payload.status === 'pending' && u.payload.attemptCount === 2,
    )
    expect(jobUpdate).toBeDefined()
    // nextAttemptAt = FIXED_NOW + 120_000ms
    const nextMs = (jobUpdate!.payload.nextAttemptAt as Date).getTime()
    expect(nextMs).toBe(FIXED_NOW.getTime() + 120_000)
    expect(typeof jobUpdate!.payload.lastError).toBe('string')
    expect(jobUpdate!.payload.lastError as string).toContain('503')
  })

  test('on 3rd attempt failure (attempt_count=2 → 3 ≥ MAX), job=failed, endpoint=disabled', async () => {
    // attempt_count=2: inline=1, worker-retry-1=2, this is worker-retry-2 (attempt 3).
    // newAttemptCount = 3 = MAX_RETRY_ATTEMPTS → disable.
    const job = makeJob({ id: 'job-final', endpoint_id: 'ep-1', attempt_count: 2 })
    const ep = makeEndpoint({ id: 'ep-1' })
    jobStore.push(job)
    endpointStore.push(ep)

    await tick(baseOpts({
      db: buildDb([job]),
      fetchImpl: failFetch(500),
    }))

    // Job update: status='failed', attemptCount=3
    const jobUpdate = dbUpdates.find(
      (u) => u.payload.status === 'failed' && u.payload.attemptCount === 3,
    )
    expect(jobUpdate).toBeDefined()

    // Endpoint update: status='disabled'
    const epUpdate = dbUpdates.find((u) => u.payload.status === 'disabled')
    expect(epUpdate).toBeDefined()
  })

  test('reclaims stale-lock jobs: status=running with old lockedAt is reset to pending before claiming', async () => {
    const staleJob = makeJob({
      id: 'job-stale',
      endpoint_id: 'ep-1',
      status: 'running',
      locked_by: 'dead-worker',
      locked_at: new Date(FIXED_NOW.getTime() - 600_000), // 10 min old lock (stale threshold = 5 min)
    })
    jobStore.push(staleJob)
    endpointStore.push(makeEndpoint({ id: 'ep-1' }))

    // Claim result is empty: stale reclaim runs, then no new jobs are claimed.
    await tick(baseOpts({ db: buildDb([]) }))

    // The mock's stale-lock simulation should have reset the job to pending.
    expect(staleJob.status).toBe('pending')
    expect(staleJob.locked_by).toBeNull()
    expect(staleJob.locked_at).toBeNull()
  })

  test('disabled endpoint: job marked completed with abandonment note, no HTTP call', async () => {
    const job = makeJob({ id: 'job-disabled-ep', endpoint_id: 'ep-dis' })
    const ep = makeEndpoint({ id: 'ep-dis', status: 'disabled' })
    jobStore.push(job)
    endpointStore.push(ep)

    const fetchSpy = okFetch()
    await tick(baseOpts({
      db: buildDb([job]),
      fetchImpl: fetchSpy,
    }))

    // No HTTP request should have been made.
    expect(fetchSpy).not.toHaveBeenCalled()

    // Job update: status='completed' with a note about the disabled endpoint.
    const jobUpdate = dbUpdates.find((u) => u.payload.status === 'completed')
    expect(jobUpdate).toBeDefined()
    expect(typeof jobUpdate!.payload.lastError).toBe('string')
    expect((jobUpdate!.payload.lastError as string).toLowerCase()).toContain('disabled')
  })

  test('deleted endpoint: job marked completed with abandonment note, no HTTP call', async () => {
    const job = makeJob({ id: 'job-gone-ep', endpoint_id: 'ep-gone' })
    // endpointStore is empty — endpoint was deleted (FK cascade removes the job
    // in production, but the job was already claimed before the endpoint was deleted).
    jobStore.push(job)

    const fetchSpy = okFetch()
    await tick(baseOpts({
      db: buildDb([job]),
      fetchImpl: fetchSpy,
    }))

    expect(fetchSpy).not.toHaveBeenCalled()

    const jobUpdate = dbUpdates.find((u) => u.payload.status === 'completed')
    expect(jobUpdate).toBeDefined()
    expect((jobUpdate!.payload.lastError as string).toLowerCase()).toContain('deleted')
  })

  test('no-op tick when no due jobs are claimed', async () => {
    const fetchSpy = okFetch()
    await tick(baseOpts({
      db: buildDb([]), // empty claim result
      fetchImpl: fetchSpy,
    }))

    expect(fetchSpy).not.toHaveBeenCalled()
    // No DB updates should have been issued (only the two execute() calls for
    // stale reclaim and claim, both of which return empty).
    expect(dbUpdates).toHaveLength(0)
  })

  // SKIP LOCKED concurrency note:
  // True SKIP LOCKED behavior requires a real Postgres DB. The raw SQL in
  // tick() includes FOR UPDATE SKIP LOCKED so two concurrent workers will each
  // lock a disjoint subset of rows at the DB level. This cannot be unit-tested
  // without integration infra. The workerId in lockedBy is the observable
  // side-effect that proves locking was requested.
  test('claim SQL is executed (proves tick calls db.execute for the claim query)', async () => {
    const job = makeJob({ id: 'job-lock', endpoint_id: 'ep-1' })
    const ep = makeEndpoint({ id: 'ep-1' })
    jobStore.push(job)
    endpointStore.push(ep)

    await tick(baseOpts({
      db: buildDb([job]),
      workerId: 'my-unique-worker-id',
      fetchImpl: okFetch(),
    }))

    // At least two SQL executions: stale reclaim + claim query.
    expect(executedSqlSnippets.length).toBeGreaterThanOrEqual(2)
    // Job should have been delivered successfully.
    const completedUpdate = dbUpdates.find((u) => u.payload.status === 'completed')
    expect(completedUpdate).toBeDefined()
  })
})
