/**
 * Cloud Tasks REST client — enqueues webhook delivery tasks.
 *
 * We deliberately avoid `@google-cloud/tasks` (it pulls in google-gax +
 * grpc-js, ~20 MB of native deps that Bun handles awkwardly). A single REST
 * call is sufficient to create a task, and we already use
 * `google-auth-library` for access-token minting elsewhere.
 */
import { GoogleAuth } from 'google-auth-library'

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
})

export interface WebhookDeliveryTaskPayload {
  endpointId: string
  event: string
  eventId: string
  jsonBody: string
  occurredAt: string
}

export interface EnqueueWebhookDeliveryOptions {
  /** GCP project id. Defaults to process.env.GCP_PROJECT_ID. */
  projectId?: string
  /** Cloud Tasks queue location (region). Defaults to process.env.CLOUD_TASKS_LOCATION. */
  location?: string
  /** Queue name. Defaults to process.env.CLOUD_TASKS_QUEUE. */
  queue?: string
  /** Service base URL, e.g. https://coms-portal-app-xxx.run.app. Defaults to SERVICE_URL. */
  serviceUrl?: string
  /** Service account email Cloud Tasks should mint OIDC tokens for. Defaults to CLOUD_TASKS_SA_EMAIL. */
  taskServiceAccountEmail?: string
  /** Delay before the task is dispatched. Defaults to 30s, matching the original retry cadence. */
  delayMs?: number
  /** Override fetch (testing). */
  fetchImpl?: typeof fetch
  /** Override `now()` (testing). */
  now?: () => Date
  /** Override the auth token getter (testing). */
  getAccessToken?: () => Promise<string>
}

const DEFAULT_DELAY_MS = 30_000

function requireEnv(name: string, override: string | undefined): string {
  const value = override ?? process.env[name]
  if (!value) {
    throw new Error(`enqueueWebhookDelivery: ${name} is not set`)
  }
  return value
}

/**
 * Create a Cloud Task that POSTs the given payload to /api/internal/webhook-delivery.
 *
 * Cloud Tasks owns the retry schedule (max 3 attempts, 30s/2min backoff per the
 * queue config). On the final attempt the delivery handler disables the
 * endpoint inline before returning 502 — Cloud Tasks has no native dead-letter
 * forwarder, so the handler is the only place we can detect terminal failure.
 */
export async function enqueueWebhookDelivery(
  payload: WebhookDeliveryTaskPayload,
  opts: EnqueueWebhookDeliveryOptions = {},
): Promise<void> {
  const projectId = requireEnv('GCP_PROJECT_ID', opts.projectId)
  const location = requireEnv('CLOUD_TASKS_LOCATION', opts.location)
  const queue = requireEnv('CLOUD_TASKS_QUEUE', opts.queue)
  const serviceUrl = requireEnv('SERVICE_URL', opts.serviceUrl)
  const taskSa = requireEnv('CLOUD_TASKS_SA_EMAIL', opts.taskServiceAccountEmail)

  const fetchImpl = opts.fetchImpl ?? fetch
  const now = opts.now ?? (() => new Date())
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS

  const accessToken = opts.getAccessToken
    ? await opts.getAccessToken()
    : await auth.getAccessToken()
  if (!accessToken) throw new Error('Failed to obtain GCP access token for Cloud Tasks')

  const parent = `projects/${projectId}/locations/${location}/queues/${queue}`
  const url = `https://cloudtasks.googleapis.com/v2/${parent}/tasks`

  // Cloud Tasks expects the request body to be a base64-encoded string.
  // Buffer.from(...).toString('base64') is safe for arbitrary UTF-8 input —
  // btoa() would choke on non-Latin1 characters in the payload.
  const bodyB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
  const scheduleTime = new Date(now().getTime() + delayMs).toISOString()

  const taskBody = {
    task: {
      httpRequest: {
        httpMethod: 'POST',
        url: `${serviceUrl}/api/internal/webhook-delivery`,
        headers: { 'Content-Type': 'application/json' },
        body: bodyB64,
        oidcToken: {
          serviceAccountEmail: taskSa,
          audience: serviceUrl,
        },
      },
      scheduleTime,
    },
  }

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(taskBody),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Cloud Tasks enqueue failed (${res.status}): ${text.slice(0, 300)}`)
  }
}
